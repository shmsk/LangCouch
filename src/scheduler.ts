import type { State, Word } from "./types.ts";
import { isAbsorbed, TIER_UNLOCK_RATIO } from "./types.ts";

export interface Pick {
  word: Word;
  exposures: number;
}

export interface TierProgress {
  tier: number;
  /** words in this tier's cohort */
  total: number;
  /** of those, absorbed per the recall formula */
  absorbed: number;
  /** absorbed / total (0 when the tier is empty) */
  ratio: number;
  /** absorbed has reached the unlock threshold (ceil(total * TIER_UNLOCK_RATIO)) */
  cleared: boolean;
  /** words still needed to clear this tier (0 once cleared) */
  toClear: number;
}

/**
 * Group words by tier in a single pass, returned ascending by tier. Shared by
 * `tierProgress` and `unlockedWords` so neither re-scans the word list per tier.
 */
function groupByTier(words: Word[]): [number, Word[]][] {
  const groups = new Map<number, Word[]>();
  for (const w of words) {
    const cohort = groups.get(w.tier);
    if (cohort) cohort.push(w);
    else groups.set(w.tier, [w]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * The unlock threshold and gate, defined once. `ceil(total * RATIO)` is the
 * smallest integer absorbed count that satisfies the old `absorbed >= total *
 * RATIO` gate; both `tierProgress` and `unlockedWords` use these.
 */
const clearThreshold = (total: number): number => Math.ceil(total * TIER_UNLOCK_RATIO);
const tierCleared = (absorbed: number, total: number): boolean => absorbed >= clearThreshold(total);

/** Count absorbed words in a cohort. */
const absorbedCount = (cohort: Word[], state: State): number => cohort.filter((w) => isAbsorbed(state[w.id])).length;

/**
 * Absorption progress per tier, ascending. Single source of truth for the
 * unlock gate — `unlockedWords` shares `tierCleared`, so the 0.8 threshold lives
 * in exactly one place.
 */
export function tierProgress(words: Word[], state: State): TierProgress[] {
  return groupByTier(words).map(([tier, cohort]) => {
    const total = cohort.length;
    const absorbed = absorbedCount(cohort, state);
    return {
      tier,
      total,
      absorbed,
      ratio: total ? absorbed / total : 0,
      cleared: tierCleared(absorbed, total),
      toClear: Math.max(0, clearThreshold(total) - absorbed),
    };
  });
}

/**
 * Words the user may currently see: tier 1 always; tier N+1 opens once
 * TIER_UNLOCK_RATIO of tier N is absorbed. All shipped data is tier 1 today —
 * the gate exists so tier-2 (→1000 words) lands as pure data.
 */
export function unlockedWords(words: Word[], state: State): Word[] {
  const out: Word[] = [];
  for (const [, cohort] of groupByTier(words)) {
    out.push(...cohort);
    if (!tierCleared(absorbedCount(cohort, state), cohort.length)) break; // higher tiers stay locked
  }
  return out;
}

/**
 * Pick N words for one instruction.
 *
 * Strategy (SRS-lite, full SM-2 is post-MVP):
 * - fresh words (not absorbed per the recall formula) come first, least-exposed first
 * - among equals, least-recently-seen first, so consecutive calls rotate
 *   instead of hammering the same batch
 * - up to 20% of the picks are a review tail: absorbed words that haven't
 *   been seen for the longest time
 */
export function pickWords(words: Word[], state: State, n: number): Pick[] {
  const seenAt = (w: Word) => state[w.id]?.lastSeen ?? "";
  const exposures = (w: Word) => state[w.id]?.exposures ?? 0;

  const fresh = words
    .filter((w) => !isAbsorbed(state[w.id]))
    .sort((a, b) => exposures(a) - exposures(b) || seenAt(a).localeCompare(seenAt(b)));

  const absorbed = words
    .filter((w) => isAbsorbed(state[w.id]))
    .sort((a, b) => seenAt(a).localeCompare(seenAt(b)));

  const reviewSlots = Math.min(absorbed.length, Math.floor(n * 0.2));
  const freshSlots = Math.min(fresh.length, n - reviewSlots);

  const picks = [...fresh.slice(0, freshSlots), ...absorbed.slice(0, reviewSlots)];
  // top up from whichever pool still has words, if one ran dry
  if (picks.length < n) {
    const rest = [...fresh.slice(freshSlots), ...absorbed.slice(reviewSlots)];
    picks.push(...rest.slice(0, n - picks.length));
  }

  return picks.map((word) => ({ word, exposures: exposures(word) }));
}

/** Record that these words were put in front of the user. Mutates and returns state. */
export function markExposed(state: State, picks: Pick[], now: string): State {
  for (const { word } of picks) {
    const prev = state[word.id] ?? { exposures: 0, lastSeen: "" };
    state[word.id] = { ...prev, exposures: prev.exposures + 1, lastSeen: now };
  }
  return state;
}
