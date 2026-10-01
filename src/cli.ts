#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { initConfig, loadConfig, saveConfig, loadState, saveState, loadWordlist, loadGrammar, loadPatterns, falseFriendsFor, availableLangs, userLangs, wordlistPath, wordlistLayers, normalizeLang, baseLang, langsWithState, sharedWithBase, changelogFor, PLUGIN_VERSION, DATA_DIR, CONCEPTS_PATH, USER_WORDLISTS_DIR } from "./store.ts";
import { runValidation } from "./validate.ts";
import { langName } from "./instruction.ts";
import { invocationKey, isDuplicateInvocation } from "./guard.ts";
import { pickGrammar, markGrammarShown, grammarProgress, type GrammarItem } from "./grammar.ts";
import { pickPattern, markPatternShown, patternCue, patternProgress, PATTERN_MIN_LEVEL, type Pattern } from "./patterns.ts";
import { pickWords, markExposed, unlockedWords, tierProgress, type Pick } from "./scheduler.ts";
import { migrate, pickLadder } from "./ladder.ts";
import { putServed, staleServed, takeServed, settleServed, lastReply, readTail } from "./served.ts";
import { buildInstruction } from "./instruction.ts";
import { promptGlossLang, askNativeLine, GLOSS_LANGS } from "./glossLang.ts";
import { scanRecalls, recordRecalls, applyQuizResult, checkAnswer } from "./recall.ts";
import { algorithmOf, glossFor, grammarStage, isAbsorbed, isWordKey, wordsPerResponse, type Config } from "./types.ts";
import type { Word, WordState } from "./types.ts";
import { pickSpinnerWords, tipFor, applySpinnerTips, removeSpinnerTips, countOurTips, readSettings, writeSettingsIfChanged, claudeSettingsPath } from "./spinner.ts";
import { exportBundle, importBundle, parseBundle, formatImportReport, formatExportSummary } from "./transfer.ts";
import { installClaude } from "../adapters/claude/install.ts";
import { installCodex } from "../adapters/codex/install.ts";
import { installOpencode } from "../adapters/opencode/install.ts";
import { installHermes } from "../adapters/hermes/install.ts";
import { installOpenclaw } from "../adapters/openclaw/install.ts";
import { installGemini } from "../adapters/gemini/install.ts";

/**
 * Build this turn's instruction. `mark` records the turn: algorithms 1-2 count the
 * served words as shown right away; algorithm 3 only remembers the offer, and the
 * Stop hook counts what the reply actually wove. SessionStart serves without an
 * offer to settle, since no reply of its own follows it.
 */
function makeInstruction(mark: boolean, sessionId = "", eventName = "", prompt = ""): string {
  const saved = loadConfig();
  if (saved.enabled === false) return "";
  // translations follow the language the user just wrote in; quiz, spinner and status stay on `native`
  const gloss = promptGlossLang(prompt, saved.native);
  const ask = gloss.unsure === "unknown" && saved.nativeAsked !== true;
  const config: Config = { ...saved, native: gloss.lang };
  const algorithm = algorithmOf(config);
  const words = loadWordlist(config.lang);
  const state = loadState(config.lang);
  const now = new Date().toISOString();
  const n = wordsPerResponse(config.level);
  let picks: Pick[];
  let known: Word[] = [];
  if (algorithm === 3) {
    migrate(state);
    const stale = mark ? staleServed(DATA_DIR, sessionId) : null;
    if (stale && stale.lang === config.lang) settleServed(state, stale, null, now); // host with no after-reply event
    ({ picks, known } = pickLadder(unlockedWords(words, state), state, n, now));
  } else {
    picks = pickWords(unlockedWords(words, state), state, n);
  }
  if (picks.length === 0) return "";
  const stage = grammarStage(config.level);
  const grammar = stage >= 2 ? pickGrammar(loadGrammar(config.lang), words, state, stage) : null;
  const rule = config.level >= PATTERN_MIN_LEVEL ? pickPattern(loadPatterns(config.lang), config.native, state) : null;
  if (mark) {
    if (algorithm !== 3) markExposed(state, picks, now);
    else if (eventName !== "SessionStart") {
      const ids = (ws: Word[]) => Object.fromEntries(ws.map((w) => [w.id, w.target]));
      putServed(DATA_DIR, sessionId, { lang: config.lang, at: now, picks: ids(picks.map((p) => p.word)), known: ids(known) });
    }
    if (grammar) markGrammarShown(state, grammar, now);
    if (rule) markPatternShown(state, rule, now);
    saveState(config.lang, state);
  }
  const cue = rule ? patternCue(rule, config.native, normalizeLang(config.lang), falseFriendsFor(config.lang)) : null;
  // asked once: a user who ignores the question isn't asked again
  if (ask && mark) saveConfig({ ...loadConfig(), nativeAsked: true }); // re-read: never undo a change made meanwhile
  return buildInstruction(config, picks, grammar, cue, algorithm, known, ask ? askNativeLine(langName(gloss.lang.split("-")[0]!)) : null);
}

/**
 * Stop hook (algorithm 3): read the finished reply and count the words it wove.
 * The reply comes from the payload when the host sends it, else from the transcript.
 */
function settleReply(payload: HookPayload): void {
  const config = loadConfig();
  if (config.enabled === false || algorithmOf(config) !== 3) return;
  const reply = payload.lastMessage || (payload.transcriptPath ? lastReply(readTail(payload.transcriptPath)) : "");
  // an unreadable reply leaves the offer for the served-as-woven fallback, rather than marking every word missed
  if (!reply.trim()) return;
  const now = new Date().toISOString();
  const rec = takeServed(DATA_DIR, payload.sessionId, now);
  if (!rec || rec.lang !== config.lang) return;
  const state = migrate(loadState(config.lang));
  saveState(config.lang, settleServed(state, rec, reply, now));
}

/** Rewrite our spinner tips from current progress; spinner off (or no words) removes them. Returns tips written. */
function refreshSpinner(on: boolean): number {
  const config = loadConfig();
  const before = readSettings();
  const tips = on ? pickSpinnerWords(loadWordlist(config.lang), loadState(config.lang)).map((w) => tipFor(w, config.native)) : [];
  writeSettingsIfChanged(before, on ? applySpinnerTips(before, tips) : removeSpinnerTips(before), DATA_DIR);
  return tips.length;
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
  /** Stop only: where the host keeps the conversation (Claude Code transcript JSONL) */
  transcriptPath?: string;
  /** Stop only: the finished reply, when the host sends it directly */
  lastMessage?: string;
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
    const payload = JSON.parse(raw) as { prompt?: string; session_id?: string; hook_event_name?: string; transcript_path?: string; last_assistant_message?: string; prompt_response?: string };
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      prompt: str(payload.prompt),
      sessionId: str(payload.session_id),
      eventName: str(payload.hook_event_name),
      transcriptPath: str(payload.transcript_path) || undefined,
      lastMessage: str(payload.last_assistant_message) || str(payload.prompt_response) || undefined,
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

/** Concepts a variant shares with its base, null if unreadable — status must never crash. */
function safeShared(lang: string): Set<string> | null {
  try {
    return sharedWithBase(lang);
  } catch {
    return null;
  }
}

/** Load word-building rules, degrading to [] like safeGrammar. */
function safePatterns(lang: string): Pattern[] {
  try {
    return loadPatterns(lang);
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
  const entries = Object.entries(state).filter(([k, s]) => isWordKey(k) && inProgress(s));
  const words = safeWordlist(lang);
  const dict = words.length > 0 ? String(words.length) : "—";
  return { dict, touched: entries.length, absorbed: entries.filter(([, s]) => isAbsorbed(s)).length };
}

/**
 * "What's new" for a version `status` hasn't shown yet: all of its changelog entries.
 * Marks the version seen, so it shows once per update.
 */
function whatsNew(config: Config): string | null {
  if (config.seenVersion === PLUGIN_VERSION) return null;
  saveConfig({ ...config, seenVersion: PLUGIN_VERSION });
  const items = changelogFor(PLUGIN_VERSION);
  return items.length > 0 ? `What's new in ${PLUGIN_VERSION}:\n${items.map((i) => `  • ${i}`).join("\n")}` : null;
}

function status(): string {
  const config = loadConfig();
  const news = whatsNew(config);
  const words = safeWordlist(config.lang);
  const state = loadState(config.lang);
  const byId = new Map(words.map((w) => [w.id, w.target]));
  const touched = Object.entries(state).filter(([k, s]) => isWordKey(k) && inProgress(s));
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
  const stage = grammarStage(config.level);
  const gp = grammarProgress(safeGrammar(config.lang), words, state, stage < 2 ? 2 : stage); // below stage 2, preview what stage 2 brings
  const grammarLine =
    gp.total > 0
      ? `Grammar (stage ${stage}): ${gp.unlockedCount}/${gp.total} unlocked · ${gp.introduced} introduced` +
        (gp.next ? ` · next: ${gp.next.pattern} (${gp.next.pos} ${gp.next.have}/${gp.next.need})` : "") +
        (stage < 2 ? " · weaving starts at level 4" : "")
      : null;

  const pp = patternProgress(safePatterns(config.lang), config.native, state);
  const patternLine =
    pp.total > 0
      ? `Word-building rules: ${pp.introduced}/${pp.total} introduced` +
        (pp.next ? ` · next: ${pp.next.from} → ${pp.next.to}` : "") +
        (config.level < PATTERN_MIN_LEVEL ? ` · start at level ${PATTERN_MIN_LEVEL}` : "")
      : null;

  // A regional variant shares progress with its base; only its own words are new to learn.
  const variantBase = baseLang(config.lang);
  const shared = variantBase ? safeShared(config.lang) : null;
  const regional = words.filter((w) => !shared?.has(w.id));
  const regionalLine = shared
    ? `Regional (vs ${variantBase}): ${regional.filter((w) => isAbsorbed(state[w.id])).length}/${regional.length} absorbed · ${words.length - regional.length} words share progress with ${variantBase}`
    : null;

  const others = langsWithState().filter((l) => l !== config.lang);
  const langRows = [config.lang, ...others].map((lang) => {
    const s = langSummary(lang);
    const marker = lang === config.lang ? "→" : " ";
    return `${marker} ${lang}: dictionary ${s.dict} | in progress ${s.touched} | absorbed ${s.absorbed}`;
  });

  return [
    `langcouch — ${config.lang} @ level ${config.level} (${wordsPerResponse(config.level)} words/response) · mode ${algorithmOf(config)}`,
    news,
    coreLine,
    regionalLine,
    grammarLine,
    patternLine,
    `Dictionary: ${words.length} | In progress: ${touched.length} | Absorbed (recall formula): ${absorbed.length}`,
    `Languages:\n${langRows.join("\n")}`,
    `Spinner tips: ${config.spinner ? "on" : "off (langcouch spinner on)"}`,
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

const MODE_NAMES: Record<1 | 2 | 3, string> = {
  1: "every listed word, counted when served",
  2: "only words that fit the reply, counted when served",
  3: "words that fit plus a nudge, translations fade on an interval ladder, counted when the reply uses them",
};

/** A path typed by hand; chat hosts pass "~/x" through unexpanded. */
const userPath = (p: string) => resolve(p === "~" || p.startsWith("~/") ? homedir() + p.slice(1) : p);

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
      // Gemini CLI (--host gemini, beta) names the events BeforeAgent / AfterAgent and reads
      // context only from JSON; any non-zero exit or a `decision` would block or retry its turn.
      const gemini = args[0] === "--host" && args[1] === "gemini";
      const GEMINI_EVENT: Record<string, string> = { BeforeAgent: "UserPromptSubmit", AfterAgent: "Stop" };
      let hostEvent = "";
      // `silent`: the duplicate guard prints nothing for plain-text hosts, as before
      const emit = (text: string, silent = false) => {
        if (gemini) console.log(text ? JSON.stringify({ hookSpecificOutput: { hookEventName: hostEvent || "BeforeAgent", additionalContext: text } }) : "{}");
        else if (!silent) console.log(text);
        process.exit(0);
      };
      let payload: HookPayload = { prompt: "", sessionId: "", eventName: "" };
      try {
        payload = await readHookPayload();
        hostEvent = payload.eventName;
        if (gemini) payload.eventName = GEMINI_EVENT[payload.eventName] ?? payload.eventName;
        // Plugin installs skip `init`; bootstrap the default config (idempotent, never clobbers).
        initConfig();
        // Plugin + legacy settings.json hook may both deliver the same payload — emit once.
        const key = invocationKey(payload.sessionId, payload.eventName, payload.prompt);
        if (isDuplicateInvocation(DATA_DIR, key, Date.now())) emit("", true);
      } catch {
        // guard/bootstrap are best-effort — never let them break the instruction below
      }
      if (payload.eventName === "Stop") {
        try {
          settleReply(payload);
        } catch {
          // counting is best-effort and never blocks the stop
        }
        // Codex wants JSON from a Stop hook; an empty object means "no decision" to Claude Code too
        console.log("{}");
        process.exit(0);
      }
      try {
        // recall scan: the user's own prompt is the strongest signal a word is known
        if (payload.prompt) {
          const config = loadConfig();
          if (config.enabled !== false) {
            const found = scanRecalls(payload.prompt, loadWordlist(config.lang));
            const state = loadState(config.lang);
            if (algorithmOf(config) === 3) migrate(state); // recalls climb the ladder only once it is there
            if (found.length) saveState(config.lang, recordRecalls(state, found));
          }
        }
      } catch {
        // recall is best-effort too
      }
      try {
        // spinner tips only refresh at session start: one settings write per session, not per prompt
        if (payload.eventName === "SessionStart" && loadConfig().spinner === true) refreshSpinner(true);
      } catch {
        // spinner is a bonus — a broken settings.json must never cost us the instruction
      }
      let text = "";
      try {
        text = makeInstruction(true, payload.sessionId, payload.eventName, payload.prompt);
      } catch {
        // swallow everything — empty stdout, exit 0
      }
      emit(text);
    }
    case "quiz": {
      const config = loadConfig();
      const words = loadWordlist(config.lang);
      const state = loadState(config.lang);
      if (algorithmOf(config) === 3) migrate(state); // a quiz answer climbs or resets the ladder
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
    case "mode": {
      const config = loadConfig();
      const arg = args[0];
      if (arg === undefined) {
        console.log(`Weave algorithm: ${algorithmOf(config)} (${MODE_NAMES[algorithmOf(config)]})`);
        break;
      }
      const next = Number(arg);
      if (next !== 1 && next !== 2 && next !== 3) {
        console.error("usage: langcouch mode <1|2|3> — 3: interval ladder (default), 2: only words that fit, 1: every listed word");
        process.exit(1);
      }
      saveConfig({ ...config, algorithm: next });
      console.log(`Weave algorithm: ${algorithmOf(config)} → ${next} (${MODE_NAMES[next]})`);
      break;
    }
    case "native": {
      const config = loadConfig();
      const arg = args[0];
      if (arg === undefined) {
        console.log(`Translations: ${config.native} when your message's language can't be read (Cyrillic → ru, Latin → ${["en", "uz"].includes(config.native) ? config.native : "en"}); quiz and spinner always use ${config.native}`);
        break;
      }
      if (!GLOSS_LANGS.includes(arg)) {
        console.error(`usage: langcouch native <${GLOSS_LANGS.join("|")}>`);
        process.exit(1);
      }
      saveConfig({ ...config, native: arg, nativeAsked: true });
      console.log(`Native language: ${config.native} → ${arg}`);
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
    case "spinner": {
      const config = loadConfig();
      const sub = args[0] ?? "status";
      if (sub === "on" || sub === "off") {
        saveConfig({ ...config, spinner: sub === "on" });
        const n = refreshSpinner(sub === "on");
        console.log(
          sub === "on"
            ? n > 0
              ? `Spinner tips on: ${n} words in ${claudeSettingsPath()} (refreshed every session start)`
              : "Spinner tips on — no words in progress yet, they appear after a few replies"
            : `Spinner tips off: LangCouch lines removed from ${claudeSettingsPath()}`,
        );
      } else if (sub === "status") {
        const n = countOurTips(readSettings());
        console.log(`Spinner tips: ${config.spinner ? "on" : "off"} · ${n} LangCouch lines in ${claudeSettingsPath()}`);
      } else {
        console.error("usage: langcouch spinner <on|off|status>");
        process.exit(1);
      }
      break;
    }
    case "status":
      console.log(args.includes("--absorbed") ? absorbedListView() : status());
      break;
    case "export": {
      const { bundle, skipped } = exportBundle();
      // the home folder by default: a chat host's working directory could be anywhere
      const target = args.find((a) => !a.startsWith("--")) ?? join(homedir(), `langcouch-export-${bundle.exportedAt.slice(0, 10)}.json`);
      const json = JSON.stringify(bundle, null, 2) + "\n";
      if (target === "-") {
        process.stdout.write(json);
        break;
      }
      const path = userPath(target);
      const dataDir = existsSync(DATA_DIR) ? realpathSync(DATA_DIR) : resolve(DATA_DIR);
      const parent = existsSync(dirname(path)) ? realpathSync(dirname(path)) : dirname(path);
      if (parent === dataDir || parent.startsWith(dataDir + sep)) {
        throw new Error(`langcouch: ${path} is inside ${DATA_DIR}, where it could replace your progress; pick another place`);
      }
      if (existsSync(path) && !args.includes("--force")) {
        throw new Error(`langcouch: ${path} already exists; add --force to replace it, or give another file name`);
      }
      writeFileSync(path, json);
      console.log(formatExportSummary(bundle, path, skipped));
      break;
    }
    case "import": {
      const file = args.find((a) => !a.startsWith("--"));
      if (!file) {
        console.error("usage: langcouch import <file> [--config]");
        process.exit(1);
      }
      const path = userPath(file);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path, "utf8"));
      } catch (e) {
        throw new Error(`langcouch: cannot read ${path} as JSON (${e instanceof Error ? e.message : String(e)}) — nothing was imported`);
      }
      const report = importBundle(parseBundle(raw), { takeConfig: args.includes("--config") });
      console.log(formatImportReport(report, path));
      break;
    }
    case "install": {
      if (args[0] === "claude") {
        const scope = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : "project";
        if (scope !== "project" && scope !== "user") {
          console.error("--scope must be project or user");
          process.exit(1);
        }
        console.log(installClaude(scope));
      } else if (args[0] === "codex") {
        const scope = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : "project";
        if (scope !== "project" && scope !== "user") {
          console.error("--scope must be project or user");
          process.exit(1);
        }
        console.log(installCodex(scope));
      } else if (args[0] === "opencode") {
        const scope = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : "project";
        if (scope !== "project" && scope !== "user") {
          console.error("--scope must be project or user");
          process.exit(1);
        }
        console.log(installOpencode(scope));
      } else if (args[0] === "gemini") {
        const scope = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : "project";
        if (scope !== "project" && scope !== "user") {
          console.error("--scope must be project or user");
          process.exit(1);
        }
        console.log(installGemini(scope));
      } else if (args[0] === "hermes") {
        console.log(installHermes());
      } else if (args[0] === "openclaw") {
        console.log(installOpenclaw());
      } else {
        console.error("usage: langcouch install <claude [--scope project|user] | codex [--scope project|user] | opencode [--scope project|user] | gemini [--scope project|user] | hermes | openclaw>");
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
          "  native [en|ru|uz]         your language: translations when a message's language is unclear, quiz answers",
          "  level <1-10|up|down>      weaving intensity",
          "  mode [1|2|3]              weave algorithm: 3 interval ladder (default), 2 fit only, 1 every word",
          "  quiz [n]                  absorption check (default 5 words)",
          "  export [file|-] [--force] save progress to one file (default ~/langcouch-export-<date>.json) for another machine",
          "  import <file> [--config]  merge an export into this machine's progress (keeps the best of both)",
          "  spinner <on|off|status>   words to review in the Claude Code spinner tips (opt-in)",
          "  instruction               print the weave instruction (without marking exposures)",
          "  hook                      CLI-hook mode (marks exposures, always exit 0)",
          "  install claude [--scope project|user]   register the hook in Claude Code",
          "  install codex [--scope project|user]   register the hook in Codex CLI (hooks.json)",
          "  install opencode [--scope project|user]   install the plugin + AGENTS.md fallback for opencode",
          "  install gemini [--scope project|user]   register the hook in Gemini CLI (settings.json, beta)",
          "  install hermes            install the Hermes Agent plugin ($HERMES_HOME/plugins/langcouch)",
          "  install openclaw          generate the OpenClaw plugin and print the link commands",
        ].join("\n"),
      );
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
