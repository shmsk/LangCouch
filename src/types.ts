export type Pos = "noun" | "verb" | "adj" | "adv";

/**
 * A language-independent meaning, authored once in concepts.json.
 * Glosses are keyed by native-language code — adding a native language
 * is one more key here, never a wordlist change.
 */
export interface Concept {
  id: string;
  pos: Pos;
  /** Vocabulary band: 1 = core (~400), 2 → 1000, 3 → 3000. Unlocked progressively. */
  tier: number;
  /** Optional corpus frequency rank — reserved for tier-2+ ingestion. */
  rank?: number;
  gloss: Record<string, string>;
}

/**
 * Per-language wordlist file: concept id → lemma.
 * The value may later grow to an object ({ lemma, gender, ... }) — loaders normalize.
 */
export type WordMapping = Record<string, string>;

/** A concept joined with its lemma in the active target language. */
export interface Word {
  /** Concept id — the state key: progress survives lemma fixes and links across languages. */
  id: string;
  /** The lemma in the target language ("casa"). */
  target: string;
  pos: Pos;
  tier: number;
  gloss: Record<string, string>;
}

export interface Config {
  /** Target language code, matches wordlists/<lang>.json */
  lang: string;
  /** User's native language — used for glosses in the instruction */
  native: string;
  /** 1..10; drives words-per-response and grammar stage */
  level: number;
  /** Kill switch: when false, the hook emits nothing. Toggled by pause/resume. */
  enabled?: boolean;
  /** Spanish words in the Claude Code spinner tips. Opt-in; toggled by `spinner on|off`. */
  spinner?: boolean;
}

export interface WordState {
  exposures: number;
  /** ISO timestamp of last time the word was put into an instruction */
  lastSeen: string;
  /** Times the user actively produced the word: found in their prompt or answered in quiz. */
  recalls?: number;
}

/** Keyed by concept id (grammar constructions use a "g:" prefix). */
export type State = Record<string, WordState>;

/**
 * Absorption formula: exposure is not knowledge.
 * A word is absorbed when its combined score reaches ABSORBED_SCORE,
 * AND there is at least one recall OR enough raw exposures to compensate.
 */
export const RECALL_WEIGHT = 4; // 1 recall ≈ 4 exposures
export const ABSORBED_SCORE = 8; // exposures + RECALL_WEIGHT * recalls threshold
export const NO_RECALL_EXPOSURES = 12; // exposures that absorb even with zero recalls
export const QUIZ_FAIL_EXPOSURES = 2; // exposures cap after a failed quiz — re-absorbing must be earned

/** Tier N+1 unlocks when this share of tier N is absorbed. */
export const TIER_UNLOCK_RATIO = 0.8;

export function isAbsorbed(s: WordState | undefined): boolean {
  if (!s) return false;
  const recalls = s.recalls ?? 0;
  const score = s.exposures + RECALL_WEIGHT * recalls;
  return score >= ABSORBED_SCORE && (recalls >= 1 || s.exposures >= NO_RECALL_EXPOSURES);
}

/**
 * Gloss in the user's native language, falling back to English, then anything.
 * A gloss in the target language itself is useless (house = house), so the gloss
 * keyed by `lang`'s base is skipped: learning en with native en shows ru.
 */
export function glossFor(word: Word, native: string, lang?: string): string {
  const own = lang?.split("-")[0];
  const key = [native, "en", ...Object.keys(word.gloss)].find((k) => k !== own && word.gloss[k] !== undefined);
  return (key ? word.gloss[key] : word.gloss[native] ?? Object.values(word.gloss)[0]) ?? word.id;
}

export function wordsPerResponse(level: number): number {
  // level 1 → 3 words, level 10 → 12 words
  return Math.min(12, 2 + level);
}

export type GrammarStage = 1 | 2 | 3;

export function grammarStage(level: number): GrammarStage {
  if (level >= 7) return 3;
  if (level >= 4) return 2;
  return 1;
}
