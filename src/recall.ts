import type { State, Word } from "./types.ts";
import { QUIZ_FAIL_EXPOSURES } from "./types.ts";
import { climb, reset } from "./ladder.ts";

/** On the ladder (a step is recorded) a recall climbs one step; old records only count it. */
const onLadder = (s: { step?: number }) => s.step !== undefined;
const now = () => new Date().toISOString();

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
    const next = { ...prev, recalls: (prev.recalls ?? 0) + 1 };
    state[id] = onLadder(prev) ? climb(next, now()) : next;
  }
  return state;
}

/**
 * Quiz outcome. Success = a recall. Failure resets the word out of the
 * absorbed pool: recalls wiped, exposures capped low so re-absorbing must be earned.
 */
export function applyQuizResult(state: State, id: string, ok: boolean): State {
  const prev = state[id] ?? { exposures: 0, lastSeen: "" };
  const next = ok
    ? { ...prev, recalls: (prev.recalls ?? 0) + 1 }
    : { ...prev, recalls: 0, exposures: Math.min(prev.exposures, QUIZ_FAIL_EXPOSURES) };
  state[id] = onLadder(prev) ? (ok ? climb(next, now()) : reset(next, now())) : next;
  return state;
}

/** Drop one leading word from `set` ("to work" → "work"), never the whole answer. */
export function dropLeading(s: string, set: ReadonlySet<string>): string {
  const [first, ...rest] = s.split(" ");
  return rest.length && set.has(first!) ? rest.join(" ") : s;
}

// "the child", "a kid", "to work": the meaning is right, the article is just how English says it
const GLOSS_LEADING = new Set(["the", "a", "an", "to"]);

// Uzbek Latin oʻ/gʻ/tutuq belgisi get typed with any of these; glosses store plain '.
export const normAnswer = (s: string) =>
  dropLeading(
    s.toLowerCase().trim().replaceAll("ё", "е").replace(/[ʻʼ‘’`´]/g, "'").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim(),
    GLOSS_LEADING,
  );

/**
 * Loose gloss comparison: lowercase, trim, ё=е, any apostrophe = ', a leading the/a/an/to
 * dropped, comma/slash-separated gloss variants and `alt` answers accepted — any gloss
 * language counts except the target's own (learning en, "house" is not a translation of "house").
 */
export function checkAnswer(answer: string, word: Word, lang?: string): boolean {
  const a = normAnswer(answer);
  if (!a) return false;
  const own = lang?.split("-")[0];
  const glosses = Object.entries(word.gloss)
    .filter(([k]) => k !== own)
    .flatMap(([, g]) => g.split(/[,;/()]/));
  const alts = Object.entries(word.alt ?? {})
    .filter(([k]) => k !== own)
    .flatMap(([, list]) => list);
  return [...glosses, ...alts].map(normAnswer).filter(Boolean).includes(a);
}
