import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pickGrammar, markGrammarShown, absorbedByPos, grammarKey, type GrammarItem } from "../src/grammar.ts";
import { buildInstruction } from "../src/instruction.ts";
import { pickWords } from "../src/scheduler.ts";
import { wordsPerResponse, type Pos, type State, type Word } from "../src/types.ts";

const mkWord = (id: string, pos: Pos = "noun"): Word => ({ id, target: id, pos, tier: 1, gloss: { ru: `ru-${id}`, en: `en-${id}` } });
const absorbedState = (targets: string[]): State =>
  Object.fromEntries(targets.map((t) => [t, { exposures: 4, lastSeen: "2026-01-01", recalls: 1 }]));

const words: Word[] = [mkWord("casa"), mkWord("mesa"), mkWord("sol"), mkWord("bonito", "adj"), mkWord("trabajar", "verb")];

const items: GrammarItem[] = [
  { id: "art", pattern: "gender + article el/la", exampleTarget: "la casa", exampleGloss: "the house", unlock: { pos: "noun", absorbedCount: 2 } },
  { id: "adj", pattern: "noun + adjective agreement", exampleTarget: "casa bonita", exampleGloss: "a pretty house", unlock: { pos: "adj", absorbedCount: 1 } },
];

describe("grammar planner", () => {
  test("nothing unlocked → null", () => {
    expect(pickGrammar(items, words, {})).toBeNull();
  });

  test("unlock counts absorbed words per POS", () => {
    const state = absorbedState(["casa", "mesa"]); // 2 absorbed nouns, 0 adj
    expect(absorbedByPos(words, state)).toEqual({ noun: 2, verb: 0, adj: 0, adv: 0, num: 0 });
    expect(pickGrammar(items, words, state)?.id).toBe("art");
  });

  test("least-shown unlocked construction wins", () => {
    const state = { ...absorbedState(["casa", "mesa", "bonito"]) };
    state[grammarKey("art")] = { exposures: 3, lastSeen: "2026-01-01" };
    expect(pickGrammar(items, words, state)?.id).toBe("adj"); // adj shown 0 times
  });

  test("markGrammarShown tracks exposures under g: prefix in the same state", () => {
    const state: State = {};
    markGrammarShown(state, items[0]!, "2026-07-13T00:00:00Z");
    markGrammarShown(state, items[0]!, "2026-07-13T00:00:01Z");
    expect(state["g:art"]).toEqual({ exposures: 2, lastSeen: "2026-07-13T00:00:01Z" });
    expect(state["art"]).toBeUndefined();
  });
});

describe("instruction with grammar data", () => {
  const config = { lang: "es", native: "ru", level: 5 };
  const picks = pickWords(words, {}, wordsPerResponse(5));

  test("stage 2-3 uses the construction instead of the collocation line", () => {
    const text = buildInstruction(config, picks, items[0]!);
    expect(text).toContain("gender + article el/la");
    expect(text).toContain("la casa");
    expect(text).not.toContain("short collocations"); // hardcode replaced
    const lvl8 = buildInstruction({ ...config, level: 8 }, picks, items[0]!);
    expect(lvl8).toContain("whole simple sentence"); // stage 3 keeps its sentence
    expect(lvl8).toContain("using the construction above in it");
  });

  test("no grammar → old hardcoded behaviour intact (es fallback unbroken)", () => {
    const text = buildInstruction(config, picks, null);
    expect(text).toContain("short collocations");
    const lvl8 = buildInstruction({ ...config, level: 8 }, picks, null);
    expect(lvl8).toContain("whole simple sentence");
  });

  test("instruction with construction stays within the 2400-char budget", () => {
    const manyWords = Array.from({ length: 40 }, (_, i) => mkWord(`palabra${i}`));
    const maxPicks = pickWords(manyWords, {}, wordsPerResponse(10));
    const text = buildInstruction({ ...config, level: 10 }, maxPicks, items[1]!);
    expect(text.length).toBeLessThanOrEqual(2400);
  });
});

const GRAMMAR_DIR = fileURLToPath(new URL("../grammar/", import.meta.url));
const readGrammar = (code: string) => JSON.parse(readFileSync(join(GRAMMAR_DIR, `${code}.json`), "utf8")) as GrammarItem[];
const bundled = readdirSync(GRAMMAR_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
const bases = bundled.filter((c) => !c.includes("-"));
const variants = bundled.filter((c) => c.includes("-"));

function checkSchema(list: GrammarItem[]) {
  expect(new Set(list.map((g) => g.id)).size).toBe(list.length); // unique ids
  for (const g of list) {
    expect(g.pattern.length).toBeGreaterThan(0);
    expect(g.exampleTarget.length).toBeGreaterThan(0);
    expect(g.exampleGloss.length).toBeGreaterThan(0);
    expect(["noun", "verb", "adj", "adv"]).toContain(g.unlock.pos);
    expect(g.unlock.absorbedCount).toBeGreaterThan(0);
    if (g.stage !== undefined) expect([2, 3]).toContain(g.stage);
  }
}

describe("bundled grammar files", () => {
  test.each(bases)("grammar/%s.json: 8-12 constructions, valid schema, thresholds rise per POS", (code) => {
    const list = readGrammar(code);
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.length).toBeLessThanOrEqual(12);
    checkSchema(list);
    const last: Partial<Record<Pos, number>> = {};
    for (const g of list) {
      expect(g.unlock.absorbedCount).toBeGreaterThanOrEqual(last[g.unlock.pos] ?? 0);
      last[g.unlock.pos] = g.unlock.absorbedCount;
    }
  });

  test.each(variants)("grammar/%s.json: overlay on a bundled base, every item regional with a source", (code) => {
    const base = code.split("-")[0]!;
    expect(bases).toContain(base);
    const list = readGrammar(code);
    expect(list.length).toBeGreaterThan(0);
    checkSchema(list);
    for (const g of list) {
      expect(g.baseExample?.length ?? 0).toBeGreaterThan(0);
      expect(g.source).toMatch(/^https:\/\//);
    }
  });
});

describe("every bundled construction fits the instruction budget", () => {
  const all = bundled.flatMap((code) => readGrammar(code).map((g) => ({ code, g })));
  const manyWords = Array.from({ length: 40 }, (_, i) => mkWord(`palabra${i}`));
  const maxPicks = pickWords(manyWords, {}, wordsPerResponse(10));
  test.each(all.map(({ code, g }) => [code, g.id, g] as const))("%s %s at level 10 stays within 2400 chars", (code, _id, g) => {
    for (const native of ["en", "ru", "uz"]) {
      const text = buildInstruction({ lang: code, native, level: 10 }, maxPicks, g);
      expect(text.length).toBeLessThanOrEqual(2400);
    }
  });
});
