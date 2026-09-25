import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
    expect(absorbedByPos(words, state)).toEqual({ noun: 2, verb: 0, adj: 0, adv: 0 });
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

  test("stage 2-3 uses the construction instead of hardcoded lines", () => {
    const text = buildInstruction(config, picks, items[0]!);
    expect(text).toContain("gender + article el/la");
    expect(text).toContain("la casa");
    expect(text).not.toContain("short collocations"); // hardcode replaced
    const lvl8 = buildInstruction({ ...config, level: 8 }, picks, items[0]!);
    expect(lvl8).not.toContain("whole simple sentence");
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

describe("grammar/es.json", () => {
  test("8-12 starter constructions with valid schema", () => {
    const list = JSON.parse(readFileSync(new URL("../grammar/es.json", import.meta.url).pathname, "utf8")) as GrammarItem[];
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.length).toBeLessThanOrEqual(12);
    const ids = new Set(list.map((g) => g.id));
    expect(ids.size).toBe(list.length); // unique ids
    for (const g of list) {
      expect(g.pattern.length).toBeGreaterThan(0);
      expect(g.exampleTarget.length).toBeGreaterThan(0);
      expect(g.exampleGloss.length).toBeGreaterThan(0);
      expect(["noun", "verb", "adj", "adv"]).toContain(g.unlock.pos);
      expect(g.unlock.absorbedCount).toBeGreaterThan(0);
    }
  });
});
