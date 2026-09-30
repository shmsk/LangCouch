/**
 * Weave-quality eval: how well do models follow the <langcouch> instruction?
 *
 *   bun evals/weave.ts [--models a,b] [--reps 2] [--cases id,id] [--dry]
 *
 * Every model gets the same instructions, built by the real buildInstruction from
 * the Spanish wordlist, prepended to the user message the way the adapters do it.
 *
 * Backends:
 *   opus (or any id without a slash) → local `claude --print`, billed to the
 *     Claude subscription: no --bare, API-key env vars removed, no settings
 *     sources (so no hooks or plugins add a second block).
 *   provider/model → OpenRouter chat/completions. The key comes from the macOS
 *     Keychain (service "langcouch-openrouter"), else OPENROUTER_API_KEY.
 *
 * Writes raw replies to evals/out/<timestamp>/ and prints a table per model.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadWordlist, loadGrammar, loadPatterns, falseFriendsFor } from "../src/store.ts";
import { buildInstruction } from "../src/instruction.ts";
import { pickGrammar } from "../src/grammar.ts";
import { fromFor, patternCue, PATTERN_MIN_LEVEL } from "../src/patterns.ts";
import { glossFor, grammarStage, wordsPerResponse, type Config, type Word } from "../src/types.ts";
import { scoreReply, type CaseSpec, type ReplyMetrics } from "./metrics.ts";

const DEFAULT_MODELS = ["opus", "deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3-flash"];
const SYSTEM = "You are a helpful assistant. Answer clearly and concisely.";
const LANG = "es";
const NATIVE = "en";

interface Case { id: string; level: number; prompt: string; mustKeep?: string[] }
interface Built { c: Case; instruction: string; spec: CaseSpec }
interface Answer { text: string; costUsd?: number; error?: string; ms: number }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Same case → same words for every model: tier-1 words in a fixed slice per case. */
function build(cases: Case[]): Built[] {
  const words = loadWordlist(LANG);
  const seen = new Set<string>();
  const core = words.filter((w) => w.tier === 1 && !seen.has(w.target) && seen.add(w.target));
  const patterns = loadPatterns(LANG).filter((p) => fromFor(p, NATIVE) !== null);
  const ff = falseFriendsFor(LANG);
  return cases.map((c, i) => {
    const n = wordsPerResponse(c.level);
    const start = (i * 13) % Math.max(1, core.length - n);
    const picked: Word[] = core.slice(start, start + n);
    const config: Config = { lang: LANG, native: NATIVE, level: c.level };
    const stage = grammarStage(c.level);
    const grammar = stage >= 2 ? pickGrammar(loadGrammar(LANG), words, {}, stage) : null;
    const rule = c.level >= PATTERN_MIN_LEVEL && patterns.length ? patterns[i % patterns.length]! : null;
    const cue = rule ? patternCue(rule, NATIVE, LANG, ff) : null;
    const instruction = buildInstruction(config, picked.map((word) => ({ word, exposures: 0 })), grammar, cue);
    const spec: CaseSpec = {
      served: picked.map((w) => ({ target: w.target, gloss: glossFor(w, NATIVE, LANG) })),
      ruleSuffix: cue?.to,
      mustKeep: c.mustKeep,
    };
    return { c, instruction, spec };
  });
}

function openrouterKey(): string {
  try {
    return execFileSync("security", ["find-generic-password", "-s", "langcouch-openrouter", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    const k = process.env.OPENROUTER_API_KEY;
    if (!k) throw new Error('no OpenRouter key: run security add-generic-password -s langcouch-openrouter -a "$USER" -w');
    return k;
  }
}

async function askOpenrouter(model: string, user: string, key: string): Promise<Answer> {
  const t = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }], usage: { include: true } }),
    signal: AbortSignal.timeout(180_000),
  });
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number }; error?: { message?: string } };
  const text = j.choices?.[0]?.message?.content;
  if (!res.ok || typeof text !== "string") return { text: "", error: j.error?.message ?? `HTTP ${res.status}`, ms: Date.now() - t };
  return { text, costUsd: j.usage?.cost, ms: Date.now() - t };
}

/** Subscription billing: mirrors ~/.claude/LIFEOS/TOOLS/Inference.ts (never --bare). */
function askClaude(model: string, user: string): Promise<Answer> {
  const t = Date.now();
  const env = { ...process.env };
  for (const k of ["CLAUDECODE", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]) delete env[k];
  const args = ["--print", "--model", model, "--tools", "", "--output-format", "json", "--setting-sources", "", "--system-prompt", SYSTEM];
  return new Promise((resolve) => {
    const proc = spawn("claude", args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => proc.kill("SIGTERM"), 300_000);
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", (e) => { clearTimeout(timer); resolve({ text: "", error: e.message, ms: Date.now() - t }); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out) as { result?: string; is_error?: boolean };
        if (j.is_error || typeof j.result !== "string") throw new Error(j.result ?? "no result");
        resolve({ text: j.result, ms: Date.now() - t });
      } catch (e) {
        resolve({ text: "", error: `exit ${code}: ${(e as Error).message} ${err.slice(0, 200)}`, ms: Date.now() - t });
      }
    });
    proc.stdin.end(user);
  });
}

/** Run jobs with at most `limit` in flight. */
async function pool<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i]!(); }
  }));
  return out;
}

interface Row { model: string; case: string; rep: number; answer: Answer; metrics?: ReplyMetrics; served: number; hasRule: boolean; wantsSentence: boolean }

function summarize(rows: Row[], model: string): string[] {
  const r = rows.filter((x) => x.model === model);
  const ok = r.filter((x) => x.metrics);
  const m = (x: Row) => x.metrics!;
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");
  const sum = (f: (x: Row) => number) => ok.reduce((a, x) => a + f(x), 0);
  const ruleRows = ok.filter((x) => x.hasRule), sentRows = ok.filter((x) => x.wantsSentence);
  const cost = r.reduce((a, x) => a + (x.answer.costUsd ?? 0), 0);
  return [
    model,
    `${ok.length}/${r.length}`,
    pct(sum((x) => m(x).woven.length), sum((x) => x.served)),
    (sum((x) => m(x).offList.length) / (ok.length || 1)).toFixed(1),
    String(sum((x) => m(x).selfGloss.length)),
    String(sum((x) => m(x).wrongGloss.length)),
    String(sum((x) => m(x).unformatted.length)),
    String(ok.filter((x) => m(x).codeTouched.length > 0).length),
    String(ok.filter((x) => m(x).weaveCount > Math.ceil(x.served * 1.5) + 1).length),
    pct(ruleRows.filter((x) => m(x).ruleUsed).length, ruleRows.length),
    pct(sentRows.filter((x) => m(x).sentence).length, sentRows.length),
    model.includes("/") ? `$${cost.toFixed(4)}` : "subscription",
  ];
}

async function main() {
  const models = (arg("models") ?? DEFAULT_MODELS.join(",")).split(",");
  const reps = Number(arg("reps") ?? 2);
  const only = arg("cases")?.split(",");
  const all = JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8")) as Case[];
  const built = build(only ? all.filter((c) => only.includes(c.id)) : all);

  if (process.argv.includes("--dry")) {
    for (const b of built) console.log(`## ${b.c.id} (level ${b.c.level})\n${b.instruction}\n\n${b.c.prompt}\n`);
    console.log(`${built.length} cases × ${reps} reps × ${models.length} models = ${built.length * reps * models.length} calls`);
    return;
  }

  const key = models.some((m) => m.includes("/")) ? openrouterKey() : "";
  const outDir = join(import.meta.dir, "out", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(outDir, { recursive: true });

  const rows: Row[] = [];
  const jobsFor = (model: string) => built.flatMap((b) => Array.from({ length: reps }, (_, rep) => async () => {
    const user = `${b.instruction}\n\n${b.c.prompt}`;
    const answer = model.includes("/") ? await askOpenrouter(model, user, key) : await askClaude(model, user);
    const row: Row = {
      model, case: b.c.id, rep, answer, served: b.spec.served.length,
      hasRule: !!b.spec.ruleSuffix, wantsSentence: grammarStage(b.c.level) >= 3,
      metrics: answer.error ? undefined : scoreReply(answer.text, b.spec),
    };
    process.stderr.write(`${answer.error ? "✗" : "✓"} ${model} ${b.c.id}#${rep} ${answer.ms}ms${answer.error ? ` ${answer.error}` : ""}\n`);
    return row;
  }));

  // cheap models in parallel; the subscription one strictly one call at a time
  const results = await Promise.all(models.map((model) => pool(jobsFor(model), model.includes("/") ? 4 : 1)));
  for (const r of results) rows.push(...r);

  for (const model of models) {
    const file = join(outDir, `${model.replace(/\//g, "_")}.jsonl`);
    const lines = rows.filter((r) => r.model === model).map((r) => {
      const b = built.find((x) => x.c.id === r.case)!;
      return JSON.stringify({ case: r.case, rep: r.rep, served: b.spec.served, ruleSuffix: b.spec.ruleSuffix, reply: r.answer.text, error: r.answer.error, costUsd: r.answer.costUsd, metrics: r.metrics });
    });
    writeFileSync(file, lines.join("\n") + "\n");
  }

  const head = ["model", "ok", "coverage", "off-list/reply", "self-gloss", "wrong gloss", "unformatted", "code touched", "over-weave", "rule used", "sentence", "cost"];
  const table = [head, head.map(() => "---"), ...models.map((m) => summarize(rows, m))].map((r) => `| ${r.join(" | ")} |`).join("\n");
  writeFileSync(join(outDir, "summary.md"), table + "\n");
  console.log(table);
  console.log(`\nraw replies: ${outDir}`);
}

await main();
