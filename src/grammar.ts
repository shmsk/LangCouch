import type { Pos, State, Word } from "./types.ts";
import { isAbsorbed } from "./types.ts";

export interface GrammarItem {
  id: string;
  /** Construction the model should weave in, human-readable, e.g. "gender + definite article (el/la + noun)" */
  pattern: string;
  exampleTarget: string;
  exampleGloss: string;
  /** Unlocked when the user has absorbed at least absorbedCount words of this POS */
  unlock: { pos: Pos; absorbedCount: number };
}

/** Grammar exposures share the word state file under a "g:" prefix — never collides with words. */
export const grammarKey = (id: string) => `g:${id}`;

/** True for state keys that track grammar constructions, not words. */
export const isGrammarKey = (key: string) => key.startsWith("g:");

export function absorbedByPos(words: Word[], state: State): Record<Pos, number> {
  const counts: Record<Pos, number> = { noun: 0, verb: 0, adj: 0, adv: 0 };
  for (const w of words) if (isAbsorbed(state[w.id])) counts[w.pos]++;
  return counts;
}

/** Pick the least-shown unlocked construction; null when nothing is unlocked yet. */
export function pickGrammar(items: GrammarItem[], words: Word[], state: State): GrammarItem | null {
  const counts = absorbedByPos(words, state);
  const unlocked = items.filter((g) => counts[g.unlock.pos] >= g.unlock.absorbedCount);
  if (unlocked.length === 0) return null;
  const shown = (g: GrammarItem) => state[grammarKey(g.id)]?.exposures ?? 0;
  return unlocked.sort((a, b) => shown(a) - shown(b))[0] ?? null;
}

export interface GrammarProgress {
  /** constructions available for the language */
  total: number;
  /** of those, currently unlocked (their POS absorb-threshold is met) */
  unlockedCount: number;
  /** g:-keys with exposures > 0 — constructions that have actually been woven at least once */
  introduced: number;
  /** the locked construction closest to unlocking, or null if all are unlocked */
  next: { pattern: string; pos: Pos; have: number; need: number } | null;
}

/**
 * Snapshot of grammar unlock progress for `status`. Constructions have no
 * "mastered" signal — only "shown N times" (exposures) and "unlocked / not".
 * `next` is the locked construction with the smallest remaining POS-absorb gap.
 */
export function grammarProgress(items: GrammarItem[], words: Word[], state: State): GrammarProgress {
  const counts = absorbedByPos(words, state);
  const isUnlocked = (g: GrammarItem) => counts[g.unlock.pos] >= g.unlock.absorbedCount;
  const introduced = Object.keys(state).filter((k) => isGrammarKey(k) && (state[k]?.exposures ?? 0) > 0).length;
  const next =
    items
      .filter((g) => !isUnlocked(g))
      .map((g) => ({ pattern: g.pattern, pos: g.unlock.pos, have: counts[g.unlock.pos], need: g.unlock.absorbedCount }))
      .sort((a, b) => a.need - a.have - (b.need - b.have))[0] ?? null;
  return { total: items.length, unlockedCount: items.filter(isUnlocked).length, introduced, next };
}

/** Track that a construction went into an instruction. Mutates and returns state. */
export function markGrammarShown(state: State, item: GrammarItem, now: string): State {
  const prev = state[grammarKey(item.id)] ?? { exposures: 0, lastSeen: "" };
  state[grammarKey(item.id)] = { exposures: prev.exposures + 1, lastSeen: now };
  return state;
}
