/**
 * Pure building blocks of the weave eval: a learner state per stage, the
 * instructions the real scheduler serves from it, and the blind judge's
 * letter shuffle and parsing. No I/O beyond the wordlist loaders.
 */
import { loadWordlist, loadGrammar, loadPatterns, falseFriendsFor } from "../src/store.ts";
import { buildInstruction, type WeaveAlgorithm } from "../src/instruction.ts";
import { pickGrammar, markGrammarShown } from "../src/grammar.ts";
import { pickPattern, patternCue, markPatternShown, PATTERN_MIN_LEVEL } from "../src/patterns.ts";
import { pickWords, markExposed, unlockedWords } from "../src/scheduler.ts";
import { glossFor, grammarStage, wordsPerResponse, NO_RECALL_EXPOSURES, type Config, type State, type Word } from "../src/types.ts";
import type { CaseSpec } from "./metrics.ts";

export const LANG = "es";
export const NATIVE = "en";

export interface Stage { id: string; absorbed: number; level: number }
export interface Topic { id: string; prompt: string; mustKeep?: string[] }
export interface Built { stage: Stage; topic: Topic; instruction: string; spec: CaseSpec; hasRule: boolean; wantsSentence: boolean }

/** FNV-1a: a stable 32-bit hash, so the same seed always "learns" the same words. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** A learner who absorbed `share` of the words: the same set for every model and every run with this seed. */
export function learnerState(words: Word[], share: number, seed: string): State {
  const order = [...words].sort((a, b) => hash(seed + a.id) - hash(seed + b.id) || a.id.localeCompare(b.id));
  const state: State = {};
  const n = Math.round(words.length * share);
  // staggered lastSeen so the review tail rotates the way it does for a real learner
  order.slice(0, n).forEach((w, i) => (state[w.id] = { exposures: NO_RECALL_EXPOSURES, lastSeen: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
  return state;
}

/**
 * The instructions one learner gets over a session: topics in order, each marked
 * exposed afterwards, exactly as the hook does (src/cli.ts makeInstruction).
 */
export function buildStage(stage: Stage, topics: Topic[], seed: string, algorithm: WeaveAlgorithm = 1): Built[] {
  const words = loadWordlist(LANG);
  const state = learnerState(words, stage.absorbed, seed);
  const config: Config = { lang: LANG, native: NATIVE, level: stage.level };
  const gstage = grammarStage(stage.level);
  const lexicon = words.map((w) => w.target);
  return topics.map((topic, i) => {
    const picks = pickWords(unlockedWords(words, state), state, wordsPerResponse(stage.level));
    const grammar = gstage >= 2 ? pickGrammar(loadGrammar(LANG), words, state, gstage) : null;
    const rule = stage.level >= PATTERN_MIN_LEVEL ? pickPattern(loadPatterns(LANG), NATIVE, state) : null;
    const now = new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString();
    markExposed(state, picks, now);
    if (grammar) markGrammarShown(state, grammar, now);
    if (rule) markPatternShown(state, rule, now);
    const cue = rule ? patternCue(rule, NATIVE, LANG, falseFriendsFor(LANG)) : null;
    return {
      stage,
      topic,
      instruction: buildInstruction(config, picks, grammar, cue, algorithm),
      spec: {
        served: picks.map((p) => ({ target: p.word.target, gloss: glossFor(p.word, NATIVE, LANG) })),
        ruleSuffix: cue?.to,
        mustKeep: topic.mustKeep,
        lexicon,
      },
      hasRule: !!cue,
      wantsSentence: gstage >= 3,
    };
  });
}

/** Blind letters for one judged group: a stable shuffle, so a rerun judges the same layout. */
export function letterMap(models: string[], key: string): Record<string, string> {
  const order = [...models].sort((a, b) => hash(key + a) - hash(key + b) || a.localeCompare(b));
  return Object.fromEntries(order.map((m, i) => [String.fromCharCode(65 + i), m]));
}

export interface Verdict { answer: number; weave: number; why?: string }

/** The judge's JSON, mapped back from letters to models. Unknown letters and bad scores are dropped. */
export function parseJudge(text: string, letters: Record<string, string>): Record<string, Verdict> {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return {};
  let raw: Record<string, Partial<Verdict>>;
  try { raw = JSON.parse(json); } catch { return {}; }
  const ok = (n: unknown): n is number => typeof n === "number" && n >= 1 && n <= 5;
  const out: Record<string, Verdict> = {};
  for (const [letter, v] of Object.entries(raw)) {
    const model = letters[letter];
    if (model && v && ok(v.answer) && ok(v.weave)) out[model] = { answer: v.answer, weave: v.weave, why: typeof v.why === "string" ? v.why : undefined };
  }
  return out;
}

export const JUDGE_SYSTEM = "You are a strict, fair evaluator of assistant replies. Reply with JSON only.";

export function judgePrompt(task: string, served: string[], answers: Record<string, string>): string {
  const blocks = Object.entries(answers).map(([l, a]) => `=== Answer ${l} ===\n${a}`).join("\n\n");
  return [
    "Several assistants answered the same task. Each was also asked to weave a few Spanish words into its English prose, as passive language practice, in the format **word** (translation).",
    `Spanish words they were given: ${served.join(", ")}.`,
    "Score each answer 1-5 on two things:",
    "- answer: is the reply itself still correct, complete and useful for the task, as if the Spanish were not there? 5 = as good as a normal expert answer.",
    "- weave: do the Spanish words sit naturally where an English word was going to be anyway? Penalise sentences or metaphors invented just to host a word, words forced into code explanations, and anything that makes the reply harder to use. Skipping a word that does not fit is fine.",
    'Return only JSON: {"A": {"answer": n, "weave": n, "why": "one line, only when a score is 2 or lower"}, ...}',
    "",
    `=== Task ===\n${task}`,
    "",
    blocks,
  ].join("\n");
}
