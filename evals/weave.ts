/**
 * Weave-quality eval: how well do models follow the <langcouch> instruction?
 * The logic (stages, seed, topics, metrics, judge) is described in evals/README.md.
 *
 *   bun evals/weave.ts [--algo 1|2|3] [--stage beginner|half|advanced|all] [--models a,b] [--reps 2] [--no-judge] [--dry]
 *   bun evals/weave.ts --rescore evals/out/<run>      re-score saved replies, no calls
 *   bun evals/weave.ts --fill evals/out/<run>         re-ask failed replies, re-judge their groups
 *   bun evals/weave.ts --rejudge evals/out/<run>      re-judge every group (after a judge-prompt change)
 *
 * Backends:
 *   opus (or any id without a slash) → local `claude --print`, billed to the
 *     Claude subscription: no --bare, API-key env vars removed, no settings
 *     sources (so no hooks or plugins add a second block).
 *   provider/model → OpenRouter chat/completions. The key comes from the macOS
 *     Keychain (service "langcouch-openrouter"), else OPENROUTER_API_KEY.
 *
 * Writes raw replies and judge verdicts to evals/out/<run>/ and the tables to evals/results/algo-<n>.md.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { scoreReply, type CaseSpec, type ReplyMetrics } from "./metrics.ts";
import { liveView, type Lane } from "./progress-view.ts";
import type { WeaveAlgorithm } from "../src/instruction.ts";
import { buildStage, letterMap, parseJudge, judgePrompt, JUDGE_SYSTEM, type Stage, type Topic, type Built, type Verdict } from "./stages.ts";

const DEFAULT_MODELS = ["opus", "deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3-flash", "qwen/qwen3.8-flash"];
const JUDGE_MODEL = "opus";
const SYSTEM = "You are a helpful assistant. Answer clearly and concisely.";
const DIR = import.meta.dir;
const resultsFile = (algo: number) => join(DIR, "results", `algo-${algo}.md`);
const runAlgo = (runDir: string): WeaveAlgorithm => (existsSync(join(runDir, "meta.json")) ? (JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8")) as { algo: WeaveAlgorithm }).algo : 1);
const FINDINGS_START = "<!-- findings:start -->";
const FINDINGS_END = "<!-- findings:end -->";

interface Answer { text: string; costUsd?: number; error?: string; ms: number }
interface Row { model: string; stage: string; topic: string; rep: number; reply: string; error?: string; costUsd?: number; spec: CaseSpec; hasRule: boolean; wantsSentence: boolean; metrics?: ReplyMetrics }
interface Judged { stage: string; topic: string; rep: number; letters: Record<string, string>; verdicts: Record<string, Verdict>; error?: string }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const readJson = <T>(file: string): T => JSON.parse(readFileSync(join(DIR, file), "utf8")) as T;
const readJsonl = <T>(path: string): T[] => (existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : []);

function openrouterKey(): string {
  try {
    return execFileSync("security", ["find-generic-password", "-s", "langcouch-openrouter", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    const k = process.env.OPENROUTER_API_KEY;
    if (!k) throw new Error('no OpenRouter key: run security add-generic-password -s langcouch-openrouter -a "$USER" -w');
    return k;
  }
}

async function askOpenrouter(model: string, system: string, user: string, key: string): Promise<Answer> {
  const t = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], usage: { include: true } }),
      signal: AbortSignal.timeout(300_000),
    });
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number }; error?: { message?: string } };
    const text = j.choices?.[0]?.message?.content;
    if (!res.ok || typeof text !== "string") return { text: "", error: j.error?.message ?? `HTTP ${res.status}`, ms: Date.now() - t };
    return { text, costUsd: j.usage?.cost, ms: Date.now() - t };
  } catch (e) {
    return { text: "", error: (e as Error).message, ms: Date.now() - t };
  }
}

/** Subscription billing: mirrors ~/.claude/LIFEOS/TOOLS/Inference.ts (never --bare). */
function askClaude(model: string, system: string, user: string): Promise<Answer> {
  const t = Date.now();
  const env = { ...process.env };
  for (const k of ["CLAUDECODE", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]) delete env[k];
  const args = ["--print", "--model", model, "--tools", "", "--output-format", "json", "--setting-sources", "", "--system-prompt", system];
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

/** One retry: slow providers time out now and then (a 180 s timeout hit 4 of 120 calls in the first v2 run). */
async function ask(model: string, system: string, user: string, key: string): Promise<Answer> {
  const once = () => (model.includes("/") ? askOpenrouter(model, system, user, key) : askClaude(model, system, user));
  const first = await once();
  if (!first.error) return first;
  const second = await once();
  return second.error ? { ...second, error: `${first.error}; retry: ${second.error}` } : second;
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

// ---------- report ----------

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—");

function tableRow(rows: Row[], judged: Judged[], model: string, stage?: string): string[] {
  const r = rows.filter((x) => x.model === model && (!stage || x.stage === stage));
  const ok = r.filter((x) => x.metrics);
  const m = (x: Row) => x.metrics!;
  const sum = (f: (x: Row) => number) => ok.reduce((a, x) => a + f(x), 0);
  const ruleRows = ok.filter((x) => x.hasRule), sentRows = ok.filter((x) => x.wantsSentence);
  const v = judged.filter((j) => !stage || j.stage === stage).map((j) => j.verdicts[model]).filter((x): x is Verdict => !!x);
  const cost = r.reduce((a, x) => a + (x.costUsd ?? 0), 0);
  return [
    model,
    `${ok.length}/${r.length}`,
    pct(sum((x) => m(x).woven.length), sum((x) => x.spec.served.length)),
    (sum((x) => m(x).offList.length) / (ok.length || 1)).toFixed(1),
    String(sum((x) => m(x).selfGloss.length + m(x).wrongGloss.length)),
    String(sum((x) => m(x).unformatted.length)),
    String(ok.filter((x) => m(x).codeTouched.length > 0).length),
    pct(ruleRows.filter((x) => m(x).ruleUsed).length, ruleRows.length),
    pct(sentRows.filter((x) => m(x).sentence).length, sentRows.length),
    avg(v.map((x) => x.answer)),
    avg(v.map((x) => x.weave)),
    model.includes("/") ? `$${cost.toFixed(3)}` : "subscription",
  ];
}

const HEAD2 = ["model", "deliverables with Spanish", "Spanish /100 words", "nudge woven", "familiar glossed inline", "glossary line", "known used/reply"];

/** Deliverables for every algorithm; the ladder columns only mean something for algorithm 3. */
function tableRow2(rows: Row[], model: string, stage?: string): string[] {
  const ok = rows.filter((x) => x.model === model && (!stage || x.stage === stage) && x.metrics);
  const m = (x: Row) => x.metrics!;
  const del = ok.filter((x) => x.spec.deliverable);
  const nudgeRows = ok.filter((x) => (x.spec.nudge ?? []).length > 0);
  const famRows = ok.filter((x) => m(x).familiarUsed.length > 0);
  const ladder = ok.some((x) => x.spec.known !== undefined);
  return [
    model,
    `${del.filter((x) => m(x).inDeliverable.length > 0).length}/${del.length}`,
    avg(ok.map((x) => m(x).spanishShare)),
    ladder ? pct(nudgeRows.reduce((a, x) => a + m(x).nudgeWoven.length, 0), nudgeRows.reduce((a, x) => a + x.spec.nudge!.length, 0)) : "—",
    ladder ? String(ok.reduce((a, x) => a + m(x).glossedFamiliar.length, 0)) : "—",
    ladder ? `${famRows.filter((x) => m(x).glossaryLine).length}/${famRows.length}` : "—",
    ladder ? avg(ok.map((x) => m(x).knownUsed.length)) : "—",
  ];
}

const HEAD = ["model", "ok", "coverage", "off-list/reply", "bad gloss", "no gloss", "code/facts touched", "rule used", "sentence", "answer (1-5)", "weave (1-5)", "cost"];
const md = (rows: string[][], head = HEAD) => [head, head.map(() => "---"), ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");

function gitSha(): string {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: DIR, encoding: "utf8" }).trim(); } catch { return "unknown"; }
}

function report(rows: Row[], judged: Judged[], models: string[], stages: Stage[], runDir: string, algo: WeaveAlgorithm): string {
  const meta = existsSync(join(runDir, "meta.json")) ? (JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8")) as { sha?: string }) : {};
  const sha = meta.sha ?? gitSha();
  const parts = [
    `# Weave eval results: algorithm ${algo}`,
    "",
    `Run \`${runDir.split("/").pop()}\` on commit \`${sha}\`. Logic and metric definitions: [README.md](../README.md).`,
    `Models: ${models.map((m) => `\`${m}\``).join(", ")}. Judge: blind \`${JUDGE_MODEL}\`, scores 1-5.`,
    "",
    "## All stages",
    "",
    md(models.map((m) => tableRow(rows, judged, m))),
    "",
    md(models.map((m) => tableRow2(rows, m)), HEAD2),
  ];
  for (const s of stages) {
    parts.push("", `## Stage: ${s.id} (${Math.round(s.absorbed * 100)}% absorbed, level ${s.level})`, "", md(models.map((m) => tableRow(rows, judged, m, s.id))));
  }
  const lows = judged.flatMap((j) => Object.entries(j.verdicts).filter(([, v]) => v.why && (v.answer <= 2 || v.weave <= 2)).map(([m, v]) => `- \`${m}\` ${j.stage}/${j.topic}#${j.rep}: answer ${v.answer}, weave ${v.weave}. ${v.why}`));
  if (lows.length) parts.push("", "## Judge notes (scores of 2 or lower)", "", ...lows);
  return parts.join("\n");
}

/** Regenerate results/algo-<n>.md, keeping the hand-written findings between the markers. */
function writeResults(auto: string, algo: WeaveAlgorithm) {
  const file = resultsFile(algo);
  mkdirSync(join(DIR, "results"), { recursive: true });
  const old = existsSync(file) ? readFileSync(file, "utf8") : "";
  const s = old.indexOf(FINDINGS_START), e = old.indexOf(FINDINGS_END);
  const findings = s >= 0 && e > s ? old.slice(s, e + FINDINGS_END.length) : `${FINDINGS_START}\n## Findings\n\n_Written by hand after reading the replies._\n${FINDINGS_END}`;
  writeFileSync(file, `${findings}\n\n${auto}\n`);
}

// ---------- run ----------

async function judgeGroup(rows: Row[], stage: string, topic: string, prompt: string, rep: number, key: string): Promise<Judged> {
  const group = rows.filter((r) => r.stage === stage && r.topic === topic && r.rep === rep && !r.error);
  const letters = letterMap(group.map((r) => r.model), `${stage}/${topic}/${rep}`);
  const answers = Object.fromEntries(Object.entries(letters).map(([l, m]) => [l, group.find((r) => r.model === m)!.reply]));
  const served = group[0]?.spec.served.map((s) => s.target) ?? [];
  const a = await ask(JUDGE_MODEL, JUDGE_SYSTEM, judgePrompt(prompt, served, answers, group[0]?.spec.nudge ?? [], group[0]?.spec.known ?? []), key);
  const j: Judged = { stage, topic, rep, letters, verdicts: a.error ? {} : parseJudge(a.text, letters), error: a.error };
  if (!a.error && Object.keys(j.verdicts).length !== group.length) j.error = `parsed ${Object.keys(j.verdicts).length}/${group.length}: ${a.text.slice(0, 200)}`;
  return j;
}

/** Re-judge every group of a run (after a judge-prompt change), keeping the replies. */
async function rejudge(runDir: string) {
  const judgeFile = join(runDir, "judge.jsonl");
  const rows = readJsonl<Row>(join(runDir, "replies.jsonl"));
  const topics = new Map(readJson<Topic[]>("topics.json").map((t) => [t.id, t]));
  const keys = [...new Set(rows.map((r) => `${r.stage}/${r.topic}/${r.rep}`))];
  const key = JUDGE_MODEL.includes("/") ? openrouterKey() : "";
  const fresh = await pool(keys.map((k) => async () => {
    const [stage, topic, rep] = k.split("/");
    const j = await judgeGroup(rows, stage!, topic!, topics.get(topic!)!.prompt, Number(rep), key);
    process.stderr.write(`${j.error ? "✗" : "✓"} rejudge ${k}${j.error ? ` ${j.error}` : ""}\n`);
    return j;
  }), 1);
  writeFileSync(judgeFile, fresh.map((j) => JSON.stringify(j)).join("\n") + "\n");
  rescore(runDir);
}

/** Re-ask every failed reply of a run, then re-judge the groups that changed. Rewrites the run files in place. */
async function fill(runDir: string) {
  const repliesFile = join(runDir, "replies.jsonl"), judgeFile = join(runDir, "judge.jsonl");
  const rows = readJsonl<Row>(repliesFile);
  const topics = new Map(readJson<Topic[]>("topics.json").map((t) => [t.id, t]));
  const cfg = readJson<{ seed: string; stages: Stage[] }>("stages.json");
  const built = cfg.stages.flatMap((s) => buildStage(s, [...topics.values()], cfg.seed, runAlgo(runDir)));
  const failed = rows.filter((r) => r.error);
  const key = failed.some((r) => r.model.includes("/")) || JUDGE_MODEL.includes("/") ? openrouterKey() : "";
  const byModel = [...new Set(failed.map((r) => r.model))];
  await Promise.all(byModel.map((model) => pool(failed.filter((r) => r.model === model).map((r) => async () => {
    const b = built.find((x) => x.stage.id === r.stage && x.topic.id === r.topic)!;
    const a = await ask(model, SYSTEM, `${b.instruction}\n\n${b.topic.prompt}`, key);
    Object.assign(r, { reply: a.text, error: a.error, costUsd: a.costUsd });
    process.stderr.write(`${a.error ? "✗" : "✓"} refill ${model} ${r.stage}/${r.topic}#${r.rep}${a.error ? ` ${a.error}` : ""}\n`);
  }), model.includes("/") ? 4 : 1)));
  writeFileSync(repliesFile, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const judged = readJsonl<Judged>(judgeFile);
  const stale = new Set(failed.map((r) => `${r.stage}/${r.topic}/${r.rep}`));
  for (const j of judged.filter((j) => j.error)) stale.add(`${j.stage}/${j.topic}/${j.rep}`);
  const fresh = await pool([...stale].map((k) => async () => {
    const [stage, topic, rep] = k.split("/");
    const j = await judgeGroup(rows, stage!, topic!, topics.get(topic!)!.prompt, Number(rep), key);
    process.stderr.write(`${j.error ? "✗" : "✓"} rejudge ${k}${j.error ? ` ${j.error}` : ""}\n`);
    return j;
  }), 1);
  const kept = judged.filter((j) => !stale.has(`${j.stage}/${j.topic}/${j.rep}`));
  writeFileSync(judgeFile, [...kept, ...fresh].map((j) => JSON.stringify(j)).join("\n") + "\n");
  rescore(runDir);
}

/** Scores follow today's topics.json (mustKeep, deliverable), so runs of different algorithms compare on one rule set. */
function rescore(runDir: string) {
  const topics = new Map(readJson<Topic[]>("topics.json").map((t) => [t.id, t]));
  const rows = readJsonl<Row>(join(runDir, "replies.jsonl")).map((r) => {
    const t = topics.get(r.topic);
    const spec: CaseSpec = { ...r.spec, mustKeep: t?.mustKeep, deliverable: t?.deliverable };
    return { ...r, spec, metrics: r.error ? undefined : scoreReply(r.reply, spec) };
  });
  const judged = readJsonl<Judged>(join(runDir, "judge.jsonl"));
  const models = [...new Set(rows.map((r) => r.model))];
  const stages = readJson<{ stages: Stage[] }>("stages.json").stages.filter((s) => rows.some((r) => r.stage === s.id));
  const algo = runAlgo(runDir);
  const auto = report(rows, judged, models, stages, runDir, algo);
  writeResults(auto, algo);
  console.log(auto);
}

async function main() {
  const rescoreDir = arg("rescore");
  if (rescoreDir) return rescore(rescoreDir);
  const fillDir = arg("fill");
  if (fillDir) return fill(fillDir);
  const rejudgeDir = arg("rejudge");
  if (rejudgeDir) return rejudge(rejudgeDir);

  const models = (arg("models") ?? DEFAULT_MODELS.join(",")).split(",");
  const reps = Number(arg("reps") ?? 2);
  const stageArg = arg("stage") ?? "all";
  const cfg = readJson<{ seed: string; stages: Stage[] }>("stages.json");
  const stages = cfg.stages.filter((s) => stageArg === "all" || s.id === stageArg);
  const topics = readJson<Topic[]>("topics.json");
  const algo = Number(arg("algo") ?? 1) as WeaveAlgorithm;
  if (algo !== 1 && algo !== 2 && algo !== 3) throw new Error("--algo must be 1, 2 or 3");
  const built: Built[] = stages.flatMap((s) => buildStage(s, topics, cfg.seed, algo));

  if (process.argv.includes("--dry")) {
    for (const b of built) console.log(`## ${b.stage.id} / ${b.topic.id}\n${b.instruction}\n`);
    console.log(`${built.length} instructions × ${reps} reps × ${models.length} models = ${built.length * reps * models.length} replies`);
    return;
  }

  const key = [...models, JUDGE_MODEL].some((m) => m.includes("/")) ? openrouterKey() : "";
  const runDir = join(DIR, "out", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "meta.json"), JSON.stringify({ algo, sha: gitSha() }) + "\n");
  const repliesFile = join(runDir, "replies.jsonl");

  // brew-style bars on a terminal; plain lines when piped or run in the background
  const perModel = built.length * reps;
  const judging = !process.argv.includes("--no-judge");
  const lanes: Lane[] = [...models, ...(judging ? [`judge (${JUDGE_MODEL}, blind)`] : [])].map((name) => ({ name, done: 0, total: perModel, errors: 0 }));
  const lane = (name: string) => lanes.find((l) => l.name === name) ?? lanes[lanes.length - 1]!;
  const tty = process.stderr.isTTY;
  const view = tty ? liveView(`Weaving ${built.length} instructions × ${reps} reps: ${models.join(", ")}`, () => lanes) : null;
  const progress = (name: string, line: string, failed: boolean) => {
    const l = lane(name); l.done++; if (failed) l.errors++;
    if (!tty) process.stderr.write(line + "\n");
  };

  const jobsFor = (model: string) => built.flatMap((b) => Array.from({ length: reps }, (_, rep) => async (): Promise<Row> => {
    const a = await ask(model, SYSTEM, `${b.instruction}\n\n${b.topic.prompt}`, key);
    const row: Row = { model, stage: b.stage.id, topic: b.topic.id, rep, reply: a.text, error: a.error, costUsd: a.costUsd, spec: b.spec, hasRule: b.hasRule, wantsSentence: b.wantsSentence };
    appendFileSync(repliesFile, JSON.stringify(row) + "\n");
    progress(model, `${a.error ? "✗" : "✓"} ${model} ${b.stage.id}/${b.topic.id}#${rep} ${a.ms}ms${a.error ? ` ${a.error}` : ""}`, !!a.error);
    return { ...row, metrics: a.error ? undefined : scoreReply(a.text, b.spec) };
  }));
  // cheap models in parallel; the subscription one strictly one call at a time
  const rows = (await Promise.all(models.map((m) => pool(jobsFor(m), m.includes("/") ? 4 : 1)))).flat();

  const judged: Judged[] = [];
  if (!process.argv.includes("--no-judge")) {
    const judgeFile = join(runDir, "judge.jsonl");
    const groups = built.flatMap((b) => Array.from({ length: reps }, (_, rep) => ({ b, rep })));
    const jobs = groups.map(({ b, rep }) => async () => {
      const j = await judgeGroup(rows, b.stage.id, b.topic.id, b.topic.prompt, rep, key);
      appendFileSync(judgeFile, JSON.stringify(j) + "\n");
      progress("judge", `${j.error ? "✗" : "✓"} judge ${j.stage}/${j.topic}#${rep}${j.error ? ` ${j.error}` : ""}`, !!j.error);
      return j;
    });
    judged.push(...(await pool(jobs, JUDGE_MODEL.includes("/") ? 4 : 1)));
  }

  view?.stop();
  const auto = report(rows, judged, models, stages, runDir, algo);
  writeResults(auto, algo);
  console.log(auto);
  console.log(`\nraw replies: ${runDir}\nresults: ${resultsFile(algo)}`);
}

await main();
