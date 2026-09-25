import type { State, Word } from "./types.ts";
import { QUIZ_FAIL_EXPOSURES } from "./types.ts";

/** Min target length to count a prompt hit as recall — filters short cognate/particle noise. */
export const MIN_RECALL_LENGTH = 3;

const norm = (s: string) => s.toLowerCase().normalize("NFC");

/**
 * Find wordlist words the user actively used in their prompt; returns concept ids
 * (the state keys). Word-boundary matching via tokenization; deduped (N mentions =
 * 1 recall); multi-token targets are skipped — the scan is a cheap signal, not a parser.
 */
export function scanRecalls(prompt: string, words: Word[]): string[] {
  const tokens = new Set(norm(prompt).split(/[^\p{L}]+/u));
  return words
    .filter((w) => w.target.length >= MIN_RECALL_LENGTH && !w.target.includes(" ") && tokens.has(norm(w.target)))
    .map((w) => w.id);
}

/** Record recall events by concept id. lastSeen is NOT touched — it tracks instruction exposure only. */
export function recordRecalls(state: State, ids: string[]): State {
  for (const id of ids) {
    const prev = state[id] ?? { exposures: 0, lastSeen: "" };
    state[id] = { ...prev, recalls: (prev.recalls ?? 0) + 1 };
  }
  return state;
}

/**
 * Quiz outcome. Success = a recall. Failure resets the word out of the
 * absorbed pool: recalls wiped, exposures capped low so re-absorbing must be earned.
 */
export function applyQuizResult(state: State, id: string, ok: boolean): State {
  const prev = state[id] ?? { exposures: 0, lastSeen: "" };
  state[id] = ok
    ? { ...prev, recalls: (prev.recalls ?? 0) + 1 }
    : { ...prev, recalls: 0, exposures: Math.min(prev.exposures, QUIZ_FAIL_EXPOSURES) };
  return state;
}

// Uzbek Latin oʻ/gʻ/tutuq belgisi get typed with any of these; glosses store plain '.
const normAnswer = (s: string) => s.toLowerCase().trim().replaceAll("ё", "е").replace(/[ʻʼ‘’`´]/g, "'");

/**
 * Loose gloss comparison: lowercase, trim, ё=е, any apostrophe = ', comma/slash-separated
 * gloss variants accepted — any gloss language counts except the target's own
 * (learning en, "house" is not a translation of "house").
 */
export function checkAnswer(answer: string, word: Word, lang?: string): boolean {
  const a = normAnswer(answer);
  if (!a) return false;
  const own = lang?.split("-")[0];
  const variants = Object.entries(word.gloss)
    .filter(([k]) => k !== own)
    .map(([, g]) => g)
    .flatMap((g) => g.split(/[,;/()]/))
    .map(normAnswer)
    .filter(Boolean);
  return variants.includes(a);
}
