import { describe, expect, test } from "bun:test";
import { pickWords, markExposed, unlockedWords } from "../src/scheduler.ts";
import { buildInstruction, langName } from "../src/instruction.ts";
import { glossFor, wordsPerResponse, grammarStage, isAbsorbed, NO_RECALL_EXPOSURES, type Word, type State } from "../src/types.ts";

const mkWord = (id: string, tier = 1): Word => ({ id, target: id, pos: "noun", tier, gloss: { ru: `ru-${id}`, en: `en-${id}` } });
const words: Word[] = Array.from({ length: 40 }, (_, i) => mkWord(`w${String(i).padStart(2, "0")}`));

describe("scheduler", () => {
  test("least-exposed words come first", () => {
    const state: State = {
      w00: { exposures: 5, lastSeen: "2026-01-01" },
      w01: { exposures: 1, lastSeen: "2026-01-01" },
    };
    const picks = pickWords(words, state, 5);
    const targets = picks.map((p) => p.word.target);
    expect(targets).not.toContain("w00");
    expect(targets.filter((t) => t !== "w01").every((t) => t.startsWith("w"))).toBe(true);
    expect(picks.every((p) => p.exposures <= 1)).toBe(true);
  });

  test("absorbed words are capped at 20% review tail", () => {
    const state: State = {};
    for (const w of words.slice(0, 30)) state[w.id] = { exposures: 4, lastSeen: "2026-01-01", recalls: 1 };
    const picks = pickWords(words, state, 10);
    const absorbed = picks.filter((p) => isAbsorbed(state[p.word.id]));
    expect(absorbed.length).toBeLessThanOrEqual(2);
  });

  test("consecutive calls rotate instead of repeating", () => {
    let state: State = {};
    const first = pickWords(words, state, 5);
    state = markExposed(state, first, "2026-01-02T00:00:00Z");
    const second = pickWords(words, state, 5);
    expect(second.map((p) => p.word.target)).not.toEqual(first.map((p) => p.word.target));
  });

  test("markExposed increments and stamps, keyed by concept id, not lemma", () => {
    const state: State = {};
    const word: Word = { ...mkWord("house"), target: "casa" };
    markExposed(state, [{ word, exposures: 0 }], "2026-07-13T00:00:00Z");
    expect(state["house"]).toEqual({ exposures: 1, lastSeen: "2026-07-13T00:00:00Z" });
    expect(state["casa"]).toBeUndefined();
  });

  test("markExposed keeps recalls (regression: exposure must not erase recall history)", () => {
    const state: State = { house: { exposures: 2, lastSeen: "", recalls: 3 } };
    markExposed(state, [{ word: { ...mkWord("house"), target: "casa" }, exposures: 2 }], "2026-07-13T00:00:00Z");
    expect(state["house"]).toEqual({ exposures: 3, lastSeen: "2026-07-13T00:00:00Z", recalls: 3 });
  });

  test("tier 2 stays locked until 80% of tier 1 is absorbed", () => {
    const tier1 = Array.from({ length: 10 }, (_, i) => mkWord(`t1-${i}`));
    const tier2 = Array.from({ length: 5 }, (_, i) => mkWord(`t2-${i}`, 2));
    const all = [...tier1, ...tier2];
    const absorbed = (n: number): State =>
      Object.fromEntries(tier1.slice(0, n).map((w) => [w.id, { exposures: 4, lastSeen: "2026-01-01", recalls: 1 }]));
    expect(unlockedWords(all, absorbed(7)).every((w) => w.tier === 1)).toBe(true); // 70% < 80%
    expect(unlockedWords(all, absorbed(8))).toHaveLength(15); // 80% opens tier 2
  });

  test("pool top-up when fresh words run out", () => {
    const tiny = words.slice(0, 3);
    const state: State = {};
    for (const w of tiny) state[w.id] = { exposures: NO_RECALL_EXPOSURES, lastSeen: "2026-01-01" };
    expect(pickWords(tiny, state, 5)).toHaveLength(3);
  });
});

describe("instruction", () => {
  const config = { lang: "es", native: "ru", level: 2 };
  const picks = pickWords(words, {}, wordsPerResponse(2));

  test("contains every picked word and matches count", () => {
    const text = buildInstruction(config, picks);
    for (const p of picks) expect(text).toContain(p.word.target);
    expect(picks).toHaveLength(wordsPerResponse(2));
  });

  test("fits the 2400-char budget at max level", () => {
    const maxPicks = pickWords(words, {}, wordsPerResponse(10));
    const text = buildInstruction({ ...config, level: 10 }, maxPicks);
    expect(text.length).toBeLessThanOrEqual(2400);
  });

  test("forbids touching code and full translation", () => {
    const text = buildInstruction(config, picks);
    expect(text).toContain("code blocks");
    expect(text).toContain("translating the whole reply");
  });

  test("instruction surface is English-only with en glosses", () => {
    const text = buildInstruction({ lang: "es", native: "en", level: 8 }, picks);
    expect(text).not.toMatch(/[а-яА-Я]/);
  });

  test("language name comes from the ISO code, no registry to edit", () => {
    expect(buildInstruction({ lang: "tr", native: "en", level: 2 }, picks)).toContain("with Turkish ones");
    expect(langName("ka")).toBe("Georgian");
    expect(langName("zz-not-a-code!")).toBe("zz-not-a-code!");
  });

  test("grammar stages escalate with level", () => {
    const lvl2 = buildInstruction({ ...config, level: 2 }, picks);
    const lvl5 = buildInstruction({ ...config, level: 5 }, picks);
    const lvl8 = buildInstruction({ ...config, level: 8 }, picks);
    expect(lvl2).not.toContain("short collocations");
    expect(lvl5).toContain("short collocations");
    expect(lvl5).not.toContain("whole simple sentence");
    expect(lvl8).toContain("whole simple sentence");
    expect(grammarStage(2)).toBe(1);
    expect(grammarStage(5)).toBe(2);
    expect(grammarStage(8)).toBe(3);
  });
});

describe("glossFor", () => {
  const w: Word = { id: "house", target: "house", pos: "noun", tier: 1, gloss: { en: "house", ru: "дом", uz: "uy" } };

  test("native gloss wins; unknown native falls back to en", () => {
    expect(glossFor(w, "uz", "es")).toBe("uy");
    expect(glossFor(w, "ka", "es")).toBe("house");
  });

  test("never glosses a word in its own language: en target with en native shows ru", () => {
    expect(glossFor(w, "en", "en")).toBe("дом");
    expect(glossFor(w, "en", "en-GB")).toBe("дом");
    expect(glossFor(w, "ru", "en")).toBe("дом");
  });
});
