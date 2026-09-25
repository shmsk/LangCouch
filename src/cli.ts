#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { initConfig, loadConfig, saveConfig, loadState, saveState, loadWordlist, loadGrammar, availableLangs, userLangs, wordlistPath, wordlistLayers, normalizeLang, baseLang, langsWithState, DATA_DIR, CONCEPTS_PATH, USER_WORDLISTS_DIR } from "./store.ts";
import { runValidation } from "./validate.ts";
import { langName } from "./instruction.ts";
import { invocationKey, isDuplicateInvocation } from "./guard.ts";
import { pickGrammar, markGrammarShown, isGrammarKey, grammarProgress, type GrammarItem } from "./grammar.ts";
import { pickWords, markExposed, unlockedWords, tierProgress } from "./scheduler.ts";
import { buildInstruction } from "./instruction.ts";
import { scanRecalls, recordRecalls, applyQuizResult, checkAnswer } from "./recall.ts";
import { glossFor, grammarStage, isAbsorbed, wordsPerResponse } from "./types.ts";
import type { Word, WordState } from "./types.ts";
import { installClaude } from "../adapters/claude/install.ts";
import { installCodex } from "../adapters/codex/install.ts";
import { installOpencode } from "../adapters/opencode/install.ts";

function makeInstruction(mark: boolean): string {
  const config = loadConfig();
  if (config.enabled === false) return "";
  const words = loadWordlist(config.lang);
  const state = loadState(config.lang);
  const picks = pickWords(unlockedWords(words, state), state, wordsPerResponse(config.level));
  if (picks.length === 0) return "";
  const grammar = grammarStage(config.level) >= 2 ? pickGrammar(loadGrammar(config.lang), words, state) : null;
  if (mark) {
    const now = new Date().toISOString();
    markExposed(state, picks, now);
    if (grammar) markGrammarShown(state, grammar, now);
    saveState(config.lang, state);
  }
  return buildInstruction(config, picks, grammar);
}

/** Portable stdin drain (no Bun-only APIs — the plugin path may run under Node). */
async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

interface HookPayload {
  prompt: string;
  sessionId: string;
  eventName: string;
}

/**
 * Read the hook payload from stdin without ever hanging:
 * TTY (manual run) → skip; open-but-silent pipe → 100ms timeout wins.
 */
async function readHookPayload(): Promise<HookPayload> {
  const empty: HookPayload = { prompt: "", sessionId: "", eventName: "" };
  if (process.stdin.isTTY) return empty;
  const raw = await Promise.race([
    readAllStdin(),
    new Promise<string>((resolve) => setTimeout(() => resolve(""), 100)),
  ]);
  if (!raw) return empty;
  try {
    const payload = JSON.parse(raw) as { prompt?: string; session_id?: string; hook_event_name?: string };
    return {
      prompt: typeof payload.prompt === "string" ? payload.prompt : "",
      sessionId: typeof payload.session_id === "string" ? payload.session_id : "",
      eventName: typeof payload.hook_event_name === "string" ? payload.hook_event_name : "",
    };
  } catch {
    return { ...empty, prompt: raw }; // plain-text stdin still counts as a prompt
  }
}

/** How many words a variant's own file changes; "?" if it can't be read — listing must never crash. */
function overrideCount(lang: string): string {
  try {
    return String(Object.keys(JSON.parse(readFileSync(wordlistPath(lang)!, "utf8")) as object).length);
  } catch {
    return "?";
  }
}

/** A word is "in progress" once it's been shown or recalled at least once. */
const inProgress = (s: WordState): boolean => s.exposures > 0 || (s.recalls ?? 0) > 0;

/** Load the wordlist, degrading to [] if it was removed while state survives. */
function safeWordlist(lang: string): Word[] {
  try {
    return loadWordlist(lang);
  } catch {
    return [];
  }
}

/** Load grammar, degrading to [] if the file is missing or malformed — status must never crash. */
function safeGrammar(lang: string): GrammarItem[] {
  try {
    return loadGrammar(lang);
  } catch {
    return [];
  }
}

function langSummary(lang: string): { dict: string; touched: number; absorbed: number } {
  const state = loadState(lang);
  const entries = Object.entries(state).filter(([k, s]) => !isGrammarKey(k) && inProgress(s));
  const words = safeWordlist(lang);
  const dict = words.length > 0 ? String(words.length) : "—";
  return { dict, touched: entries.length, absorbed: entries.filter(([, s]) => isAbsorbed(s)).length };
}

function status(): string {
  const config = loadConfig();
  const words = safeWordlist(config.lang);
  const state = loadState(config.lang);
  const byId = new Map(words.map((w) => [w.id, w.target]));
  const touched = Object.entries(state).filter(([k, s]) => !isGrammarKey(k) && inProgress(s));
  const absorbed = touched.filter(([, s]) => isAbsorbed(s));
  const top = touched
    .sort((a, b) => b[1].exposures - a[1].exposures)
    .slice(0, 10)
    .map(([id, s]) => `  ${byId.get(id) ?? id} — ${s.exposures}×${(s.recalls ?? 0) > 0 ? ` (recalls ${s.recalls})` : ""}`)
    .join("\n");

  // Core vocabulary progress: the lowest not-yet-cleared tier is the active cohort.
  // Today all data is tier 1, so this reads as core-vocabulary mastery; the
  // "→ unlock tier N+1" clause only appears once a higher tier actually exists.
  const tiers = tierProgress(words, state);
  const active = tiers.find((t) => !t.cleared) ?? tiers[tiers.length - 1];
  const hasHigher = active ? tiers.some((t) => t.tier > active.tier) : false;
  const coreLine = active
    ? `Core (tier ${active.tier}): ${active.absorbed}/${active.total} absorbed · ${(active.ratio * 100).toFixed(1)}%` +
      (hasHigher && active.toClear > 0 ? ` · ${active.toClear} more to unlock tier ${active.tier + 1}` : "")
    : null;

  // Grammar progress: "shown"/"unlocked", never "mastered". Below level 4 no
  // construction is woven, so note when weaving actually starts.
  const gp = grammarProgress(safeGrammar(config.lang), words, state);
  const stage = grammarStage(config.level);
  const grammarLine =
    gp.total > 0
      ? `Grammar (stage ${stage}): ${gp.unlockedCount}/${gp.total} unlocked · ${gp.introduced} introduced` +
        (gp.next ? ` · next: ${gp.next.pattern} (${gp.next.pos} ${gp.next.have}/${gp.next.need})` : "") +
        (stage < 2 ? " · weaving starts at level 4" : "")
      : null;

  const others = langsWithState().filter((l) => l !== config.lang);
  const langRows = [config.lang, ...others].map((lang) => {
    const s = langSummary(lang);
    const marker = lang === config.lang ? "→" : " ";
    return `${marker} ${lang}: dictionary ${s.dict} | in progress ${s.touched} | absorbed ${s.absorbed}`;
  });

  return [
    `langcouch — ${config.lang} @ level ${config.level} (${wordsPerResponse(config.level)} words/response)`,
    coreLine,
    grammarLine,
    `Dictionary: ${words.length} | In progress: ${touched.length} | Absorbed (recall formula): ${absorbed.length}`,
    `Languages:\n${langRows.join("\n")}`,
    `Data: ${DATA_DIR}`,
    top ? `Most exposed:\n${top}` : `No exposures yet — run a session with the hook installed.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** `status --absorbed`: the full list of absorbed words with their gloss. */
function absorbedListView(): string {
  const config = loadConfig();
  const words = safeWordlist(config.lang);
  const state = loadState(config.lang);
  const rows = words
    .filter((w) => isAbsorbed(state[w.id]))
    .sort((a, b) => (state[b.id]?.exposures ?? 0) - (state[a.id]?.exposures ?? 0))
    .map((w) => {
      const s = state[w.id]!;
      const recalls = (s.recalls ?? 0) > 0 ? `, recalls ${s.recalls}` : "";
      return `  ${w.target} — ${glossFor(w, config.native, config.lang)} (${s.exposures}×${recalls})`;
    });
  if (rows.length === 0) return `No absorbed words yet in ${config.lang} — keep going.`;
  return [`Absorbed in ${config.lang} (${rows.length}):`, ...rows].join("\n");
}

const [cmd, ...args] = process.argv.slice(2);

try {
  switch (cmd) {
    case "init": {
      const { config, created } = initConfig();
      console.log(created ? `Created ${DATA_DIR} (${config.lang}, level ${config.level})` : `Config already exists — leaving it alone (${config.lang}, level ${config.level})`);
      break;
    }
    case "instruction":
      console.log(makeInstruction(false));
      break;
    case "hook": {
      // UserPromptSubmit contract: stdout is added to context; NEVER break the host session.
      let payload: HookPayload = { prompt: "", sessionId: "", eventName: "" };
      try {
        payload = await readHookPayload();
        // Plugin installs skip `init`; bootstrap the default config (idempotent, never clobbers).
        initConfig();
        // Plugin + legacy settings.json hook may both deliver the same payload — emit once.
        const key = invocationKey(payload.sessionId, payload.eventName, payload.prompt);
        if (isDuplicateInvocation(DATA_DIR, key, Date.now())) process.exit(0);
      } catch {
        // guard/bootstrap are best-effort — never let them break the instruction below
      }
      try {
        // recall scan: the user's own prompt is the strongest signal a word is known
        if (payload.prompt) {
          const config = loadConfig();
          if (config.enabled !== false) {
            const found = scanRecalls(payload.prompt, loadWordlist(config.lang));
            if (found.length) saveState(config.lang, recordRecalls(loadState(config.lang), found));
          }
        }
      } catch {
        // recall is best-effort too
      }
      try {
        console.log(makeInstruction(true));
      } catch {
        // swallow everything — empty stdout, exit 0
      }
      process.exit(0);
    }
    case "quiz": {
      const config = loadConfig();
      const words = loadWordlist(config.lang);
      const state = loadState(config.lang);
      const n = Math.max(1, Math.trunc(Number(args[0])) || 5);
      const seenTargets = new Set<string>();
      const candidates = words
        .filter((w) => (state[w.id]?.exposures ?? 0) > 0)
        .sort((a, b) => (state[b.id]?.exposures ?? 0) - (state[a.id]?.exposures ?? 0))
        .filter((w) => !seenTargets.has(w.target) && seenTargets.add(w.target)) // a shared word is asked once
        .slice(0, n);
      if (candidates.length === 0) {
        console.log("Nothing to quiz — no exposures yet. Work with the hook installed first.");
        break;
      }
      // node:readline instead of Bun's prompt() — quiz must work under the plugin's Node fallback
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      let correct = 0;
      for (const w of candidates) {
        const answer = await rl.question(`${w.target} → `);
        // "mañana → tomorrow" and "mañana → morning" are both right; credit the concept(s) the answer names
        const matched = words.filter((x) => x.target === w.target && checkAnswer(answer, x, config.lang));
        const ok = matched.length > 0;
        if (ok) for (const x of matched) applyQuizResult(state, x.id, true);
        else applyQuizResult(state, w.id, false);
        if (ok) correct++;
        const shown = glossFor(w, config.native, config.lang);
        const own = baseLang(config.lang) ?? config.lang;
        const others = Object.entries(w.gloss).filter(([k, g]) => k !== own && g !== shown).map(([, g]) => g);
        console.log(ok ? "  ✓" : `  ✗ ${w.target} = ${glossFor(w, config.native, config.lang)}${others.length ? ` (${others.join("; ")})` : ""}${isAbsorbed(state[w.id]) ? "" : " — back into rotation"}`);
      }
      rl.close();
      saveState(config.lang, state);
      console.log(`Score: ${correct}/${candidates.length}`);
      break;
    }
    case "level": {
      const config = loadConfig();
      const arg = args[0] ?? "";
      const next = arg === "up" ? config.level + 1 : arg === "down" ? config.level - 1 : Number(arg);
      if (!Number.isInteger(next) || next < 1 || next > 10) {
        console.error("usage: langcouch level <1-10|up|down>");
        process.exit(1);
      }
      saveConfig({ ...config, level: next });
      console.log(`Level: ${config.level} → ${next} (${wordsPerResponse(next)} words/response)`);
      break;
    }
    case "lang": {
      const config = loadConfig();
      if (!args[0]) {
        const local = new Set(userLangs());
        const rows = availableLangs().map((l) => {
          const base = baseLang(l);
          const variant = base ? ` — variant of ${base}, ${overrideCount(l)} words differ` : "";
          return `  ${l === config.lang ? "→" : " "} ${l} ${langName(l)}${variant}${local.has(l) ? " (local)" : ""}`;
        });
        console.log(`Available languages:\n${rows.join("\n")}`);
        break;
      }
      const code = normalizeLang(args[0]);
      if (!availableLangs().includes(code)) {
        console.error(`langcouch: no wordlist for "${code}" — available: ${availableLangs().join(", ")}`);
        process.exit(1);
      }
      loadWordlist(code); // fail now, not in the hook, if a variant's base is missing or a file is broken
      saveConfig({ ...config, lang: code });
      console.log(`Language: ${config.lang} → ${code} (progress is per-language, ${config.lang} is kept)`);
      break;
    }
    case "validate": {
      const target = args.find((a) => !a.startsWith("--"));
      if (!target) {
        console.error(`usage: langcouch validate <code|path.json> [--full] — user languages live in ${USER_WORDLISTS_DIR}`);
        process.exit(1);
      }
      let layers: string[];
      if (target.endsWith(".json")) {
        // An explicit variant file (…/pt-BR.json) is still checked merged over its installed base.
        const base = baseLang(normalizeLang(basename(target, ".json")));
        const basePath = base ? wordlistPath(base) : null;
        if (base && !basePath) throw new Error(`langcouch: ${target} is a variant of "${base}", but there is no ${base} wordlist to build on`);
        layers = basePath ? [basePath, target] : [target];
      } else {
        const code = normalizeLang(target);
        if (!wordlistPath(code)) {
          console.error(`langcouch: no wordlist for "${code}" — put it at ${USER_WORDLISTS_DIR}/${code}.json`);
          process.exit(1);
        }
        layers = wordlistLayers(code);
      }
      if (!runValidation(CONCEPTS_PATH, [layers], args.includes("--full"))) process.exit(1);
      break;
    }
    case "pause":
    case "resume": {
      const config = loadConfig();
      saveConfig({ ...config, enabled: cmd === "resume" });
      console.log(cmd === "pause" ? "Weaving paused (langcouch resume to turn it back on)" : "Weaving resumed");
      break;
    }
    case "status":
      console.log(args.includes("--absorbed") ? absorbedListView() : status());
      break;
    case "install": {
      if (args[0] === "claude") {
        const scope = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : "project";
        if (scope !== "project" && scope !== "user") {
          console.error("--scope must be project or user");
          process.exit(1);
        }
        console.log(installClaude(scope));
      } else if (args[0] === "codex") {
        console.log(installCodex());
      } else if (args[0] === "opencode") {
        const scope = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : "project";
        if (scope !== "project" && scope !== "user") {
          console.error("--scope must be project or user");
          process.exit(1);
        }
        console.log(installOpencode(scope));
      } else {
        console.error("usage: langcouch install <claude [--scope project|user] | codex | opencode [--scope project|user]>");
        process.exit(1);
      }
      break;
    }
    default:
      console.log(
        [
          "langcouch — learn a language without leaving the terminal (diglot weave for AI CLIs)",
          "",
          "  init                      create ~/.langcouch",
          "  pause / resume            turn weaving off/on",
          "  status [--absorbed]       level, core/grammar progress; --absorbed lists absorbed words",
          "  lang [code]               switch language / list available (regional variants too: pt-BR)",
          "  validate <code> [--full]  check a wordlist (e.g. one you added in ~/.langcouch/wordlists/)",
          "  level <1-10|up|down>      weaving intensity",
          "  quiz [n]                  absorption check (default 5 words)",
          "  instruction               print the weave instruction (without marking exposures)",
          "  hook                      CLI-hook mode (marks exposures, always exit 0)",
          "  install claude [--scope project|user]   register the hook in Claude Code",
          "  install codex   self-serve AGENTS.md section for Codex CLI (experimental)",
          "  install opencode [--scope project|user]   install the plugin + AGENTS.md fallback for opencode",
        ].join("\n"),
      );
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
