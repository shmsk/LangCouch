import { describe, expect, test } from "bun:test";
import { tierProgress } from "../src/scheduler.ts";
import { grammarProgress, grammarKey, type GrammarItem } from "../src/grammar.ts";
import type { Pos, State, Word } from "../src/types.ts";

/** A word in a given tier/POS. id doubles as the state key and target lemma. */
const word = (id: string, tier: number, pos: Pos = "noun"): Word => ({
  id,
  target: id,
  pos,
  tier,
  gloss: { en: id },
});

/** Absorbed state entry: score = 4 + 4*1 = 8 ≥ 8 and recalls ≥ 1 → isAbsorbed true. */
const ABSORBED = { exposures: 4, lastSeen: "t", recalls: 1 } as const;
/** Fresh: shown once, not absorbed. */
const FRESH = { exposures: 1, lastSeen: "t" } as const;

/** Build state marking the first `n` of `words` absorbed, the rest fresh. */
function stateWithAbsorbed(words: Word[], n: number): State {
  const state: State = {};
  words.forEach((w, i) => {
    state[w.id] = i < n ? { ...ABSORBED } : { ...FRESH };
  });
  return state;
}

describe("tierProgress", () => {
  test("single tier: ratio, cleared, toClear at the 80% gate", () => {
    const words = Array.from({ length: 10 }, (_, i) => word(`w${i}`, 1));

    // 5/10 absorbed → below gate (ceil(8)=8), 3 more needed
    let tp = tierProgress(words, stateWithAbsorbed(words, 5));
    expect(tp).toHaveLength(1);
    expect(tp[0]).toMatchObject({ tier: 1, total: 10, absorbed: 5, cleared: false, toClear: 3 });
    expect(tp[0]!.ratio).toBeCloseTo(0.5);

    // 8/10 absorbed → exactly clears
    tp = tierProgress(words, stateWithAbsorbed(words, 8));
    expect(tp[0]).toMatchObject({ absorbed: 8, cleared: true, toClear: 0 });
  });

  test("threshold uses ceil — 3-word tier needs 3 absorbed (2.4 rounds up)", () => {
    const words = Array.from({ length: 3 }, (_, i) => word(`w${i}`, 1));
    // 2/3 absorbed: ceil(3*0.8)=ceil(2.4)=3 → not cleared, 1 more
    const tp = tierProgress(words, stateWithAbsorbed(words, 2));
    expect(tp[0]).toMatchObject({ absorbed: 2, cleared: false, toClear: 1 });
  });

  test("two tiers: both reported, ascending; higher tier tracked independently", () => {
    const t1 = Array.from({ length: 10 }, (_, i) => word(`a${i}`, 1));
    const t2 = Array.from({ length: 5 }, (_, i) => word(`b${i}`, 2));
    const words = [...t1, ...t2];
    // clear all of tier 1, none of tier 2
    const state = stateWithAbsorbed(words, 10);
    const tp = tierProgress(words, state);
    expect(tp.map((t) => t.tier)).toEqual([1, 2]);
    expect(tp[0]).toMatchObject({ tier: 1, cleared: true });
    expect(tp[1]).toMatchObject({ tier: 2, absorbed: 0, cleared: false, toClear: 4 }); // ceil(5*0.8)=4
  });

  test("empty wordlist → empty progress", () => {
    expect(tierProgress([], {})).toEqual([]);
  });
});

describe("grammarProgress", () => {
  const items: GrammarItem[] = [
    { id: "def-article", pattern: "el/la + noun", exampleTarget: "", exampleGloss: "", unlock: { pos: "noun", absorbedCount: 3 } },
    { id: "indef-article", pattern: "un/una + noun", exampleTarget: "", exampleGloss: "", unlock: { pos: "noun", absorbedCount: 6 } },
    { id: "adj-agreement", pattern: "adjective agreement", exampleTarget: "", exampleGloss: "", unlock: { pos: "adj", absorbedCount: 4 } },
  ];

  test("counts unlocked constructions by absorbed POS thresholds", () => {
    // 4 nouns absorbed → def-article (≥3) unlocked, indef-article (≥6) locked; no adjs → adj-agreement locked
    const words = Array.from({ length: 4 }, (_, i) => word(`n${i}`, 1, "noun"));
    const state = stateWithAbsorbed(words, 4);
    const gp = grammarProgress(items, words, state);
    expect(gp.total).toBe(3);
    expect(gp.unlockedCount).toBe(1);
  });

  test("next = the locked construction with the smallest remaining gap", () => {
    // 4 nouns absorbed: indef-article gap = 6-4 = 2; adj-agreement gap = 4-0 = 4 → next is indef-article
    const words = Array.from({ length: 4 }, (_, i) => word(`n${i}`, 1, "noun"));
    const state = stateWithAbsorbed(words, 4);
    const gp = grammarProgress(items, words, state);
    expect(gp.next).toEqual({ pattern: "un/una + noun", pos: "noun", have: 4, need: 6 });
  });

  test("introduced counts only g:-keys with exposures > 0", () => {
    const words = Array.from({ length: 3 }, (_, i) => word(`n${i}`, 1, "noun"));
    const state = stateWithAbsorbed(words, 3);
    state[grammarKey("def-article")] = { exposures: 2, lastSeen: "t" };
    state[grammarKey("indef-article")] = { exposures: 0, lastSeen: "t" }; // never actually shown
    const gp = grammarProgress(items, words, state);
    expect(gp.introduced).toBe(1);
  });

  test("all unlocked → next is null", () => {
    const words = Array.from({ length: 6 }, (_, i) => word(`n${i}`, 1, "noun")).concat(
      Array.from({ length: 4 }, (_, i) => word(`j${i}`, 1, "adj")),
    );
    const state = stateWithAbsorbed(words, words.length);
    const gp = grammarProgress(items, words, state);
    expect(gp.unlockedCount).toBe(3);
    expect(gp.next).toBeNull();
  });
});
