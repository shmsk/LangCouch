import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { availableLangs, baseLang, loadConcepts, loadFalseFriends, loadNumberRules, loadWordMapping, loadGrammar, loadPatterns, falseFriendsFor } from "../src/store.ts";
import { pickNumberRule, numberCue, markNumberRuleShown, numeralValue, numberKey, NUMBER_RULE_INTRODUCED_AFTER, MAX_NUMERALS, type NumberRule } from "../src/numbers.ts";
import { patternCue, pickPattern } from "../src/patterns.ts";
import { buildInstruction, INSTRUCTION_BUDGET } from "../src/instruction.ts";
import { pickWords, type Pick } from "../src/scheduler.ts";
import { pickLadder } from "../src/ladder.ts";
import { wovenLemmas } from "../src/weave-detect.ts";
import { meansFor, wordsPerResponse, type FalseFriend, type State, type Word } from "../src/types.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NUMERAL_IDS = [...Array.from({ length: 21 }, (_, i) => i), 30, 40, 50, 60, 70, 80, 90, 100, 1000].map((n) => `num-${n}`);
const NATIVES = ["en", "ru", "uz"];
const fullLangs = availableLangs().filter((l) => !baseLang(l));
const bundled = (dir: string) => readdirSync(join(ROOT, "data", dir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));

const word = (id: string, target: string, pos: Word["pos"] = "noun"): Word => ({ id, target, pos, tier: 1, gloss: { en: `en-${id}`, ru: `ru-${id}` } });
const nouns = Array.from({ length: 30 }, (_, i) => word(`w${String(i).padStart(2, "0")}`, `parola${i}`));
const numerals = [word("num-3", "tre", "num"), word("num-12", "dodici", "num"), word("num-20", "venti", "num")];

describe("false friends in the learner's language", () => {
  const keyed: FalseFriend = { target: "attualmente", means: { en: "currently", ru: "сейчас", uz: "hozir" }, register: "neutral", pattern: "ly", source: "https://x" };

  test("a keyed meaning follows the native, then English", () => {
    expect(meansFor(keyed, "ru")).toBe("сейчас");
    expect(meansFor(keyed, "uz")).toBe("hozir");
    expect(meansFor(keyed, "de")).toBe("currently");
  });

  test("Anti: a plain-string meaning (user files before 0.8.0) still reads", () => {
    expect(meansFor({ ...keyed, means: "currently, now" }, "ru")).toBe("currently, now");
  });

  test("never in the language being learned: an English learner with native en sees ru", () => {
    expect(meansFor(keyed, "en", "en-GB")).toBe("сейчас");
  });

  test("the rule line carries the native meaning", () => {
    const rule = { id: "ly", from: { en: "-ly" }, to: "-mente", examples: [{ target: "finalmente", gloss: { en: "finally", ru: "наконец" } }], source: "https://x" };
    expect(patternCue(rule, "ru", "it", [keyed]).notThese).toEqual(["attualmente = сейчас"]);
    expect(patternCue(rule, "ru", "it", [{ ...keyed, means: "currently" }]).notThese).toEqual(["attualmente = currently"]);
  });

  test("every bundled false friend has its meaning in en, ru and uz", () => {
    for (const lang of bundled("falseFriends")) {
      for (const f of loadFalseFriends(lang)) {
        expect(typeof f.means, `${lang} ${f.target}`).toBe("object");
        for (const k of NATIVES) expect((f.means as Record<string, string>)[k]?.trim(), `${lang} ${f.target} ${k}`).toBeTruthy();
      }
    }
  });
});

describe("numeral data", () => {
  test("concepts.json has every numeral, pos num, glossed en/ru/uz", () => {
    const byId = new Map(loadConcepts().map((c) => [c.id, c]));
    for (const id of NUMERAL_IDS) {
      const c = byId.get(id);
      expect(c?.pos, id).toBe("num");
      for (const k of NATIVES) expect(c?.gloss[k], `${id} ${k}`).toBeTruthy();
    }
  });

  test("every full language maps every numeral", () => {
    expect(fullLangs.length).toBeGreaterThanOrEqual(7);
    for (const lang of fullLangs) {
      const map = loadWordMapping(lang);
      for (const id of NUMERAL_IDS) expect(map[id]?.trim(), `${lang} ${id}`).toBeTruthy();
    }
  });

  test("every full language has 4-8 sourced number rules with hints in en/ru/uz", () => {
    for (const lang of fullLangs) {
      const rules = loadNumberRules(lang);
      expect(rules.length, lang).toBeGreaterThanOrEqual(4);
      expect(rules.length, lang).toBeLessThanOrEqual(8);
      expect(new Set(rules.map((r) => r.id)).size, `${lang} unique ids`).toBe(rules.length);
      for (const r of rules) {
        expect(r.id, lang).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(r.source, `${lang} ${r.id}`).toMatch(/^https:\/\//);
        expect(Number.isInteger(r.example.value) && r.example.value >= 0 && r.example.value <= 9999, `${lang} ${r.id} value`).toBe(true);
        expect(r.example.target.trim(), `${lang} ${r.id} target`).toBeTruthy();
        for (const k of NATIVES) {
          expect(r.hint[k]?.trim(), `${lang} ${r.id} hint ${k}`).toBeTruthy();
          expect(r.hint[k]!.length, `${lang} ${r.id} hint ${k} length`).toBeLessThanOrEqual(110);
        }
      }
    }
  });

  test("a variant's number rules only override rules its base has", () => {
    for (const code of bundled("numbers").filter((l) => baseLang(l))) {
      const baseIds = new Set(loadNumberRules(baseLang(code)!).map((r) => r.id));
      const own = JSON.parse(readFileSync(join(ROOT, "data", "numbers", `${code}.json`), "utf8")) as NumberRule[];
      for (const r of own) expect(baseIds.has(r.id), `${code} ${r.id}`).toBe(true);
    }
  });
});

describe("numerals in the weave", () => {
  const rule: NumberRule = { id: "teens", hint: { en: "17-19: dicia- + unit", ru: "17-19: dicia- + единица" }, example: { value: 17, target: "diciassette" }, source: "https://x" };
  const picks = (ws: Word[]): Pick[] => ws.map((w) => ({ word: w, exposures: 0 }));

  test("numeralValue reads only numeral ids", () => {
    expect(numeralValue("num-12")).toBe(12);
    expect(numeralValue("num-1000")).toBe(1000);
    expect(numeralValue("number")).toBeNull();
  });

  test("a picked numeral asks for digit + word, and the number rule takes the rule slot", () => {
    const wordRule = { from: "-ly", to: "-mente", example: "finalmente = наконец", notThese: [], avoid: [] };
    for (const algorithm of [1, 2, 3] as const) {
      const text = buildInstruction({ lang: "it", native: "ru", level: 3 }, picks([nouns[0]!, numerals[1]!]), null, wordRule, algorithm, [], null, numberCue(rule, "ru"));
      expect(text, `algo ${algorithm}`).toContain("write 12 (**dodici**)");
      expect(text).toContain("Number rule: 17-19: dicia- + единица (e.g. 17 = diciassette)");
      expect(text).not.toContain("Word-building rule");
    }
  });

  test("no numeral, no numeral line", () => {
    const text = buildInstruction({ lang: "it", native: "ru", level: 3 }, picks(nouns.slice(0, 3)), null, null, 3);
    expect(text).not.toContain("Numeral:");
    expect(text).not.toContain("Number rule");
  });

  test("a number rule is served only while one is new, then the word-building rule is back", () => {
    const state: State = {};
    expect(pickNumberRule([rule], state)?.id).toBe("teens");
    for (let i = 0; i < NUMBER_RULE_INTRODUCED_AFTER; i++) markNumberRuleShown(state, rule, "2026-10-05T00:00:00Z");
    expect(state[numberKey("teens")]?.exposures).toBe(NUMBER_RULE_INTRODUCED_AFTER);
    expect(pickNumberRule([rule], state)).toBeNull();
  });

  test("3 (**tre**) counts as woven; a bare digit or an unbolded word never does", () => {
    expect(wovenLemmas("Нашёл 3 (**tre**) файла.", ["tre"])).toEqual(["tre"]);
    expect(wovenLemmas("Нашёл 3 файла.", ["tre"])).toEqual([]);
    expect(wovenLemmas("Нашёл **3** файла.", ["tre"])).toEqual([]);
    expect(wovenLemmas("`3 (**tre**)`", ["tre"])).toEqual([]);
  });

  test(`Anti: at most ${MAX_NUMERALS} numeral per reply, on both pickers`, () => {
    const pool = [...numerals, ...nouns];
    const ladder = pickLadder(pool, {}, 12, "2026-10-05T00:00:00Z").picks;
    expect(ladder.filter((p) => p.word.pos === "num").length).toBe(MAX_NUMERALS);
    expect(ladder.length).toBe(12);
    const scheduled = pickWords(pool, {}, 12);
    expect(scheduled.filter((p) => p.word.pos === "num").length).toBe(MAX_NUMERALS);
    expect(scheduled.length).toBe(12);
  });

  test("words, a numeral, a construction and the longest number rule stay within budget", () => {
    const grammar = { id: "g", pattern: "p".repeat(80), exampleTarget: "t".repeat(30), exampleGloss: "g".repeat(30), baseExample: "b".repeat(30), unlock: { pos: "noun" as const, absorbedCount: 1 } };
    const longestRule = (lang: string) => [...loadNumberRules(lang)].sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
    for (const lang of fullLangs) {
      const r = longestRule(lang);
      if (!r) continue;
      for (const native of NATIVES) {
        const longNumeral = word("num-1000", "x".repeat(20), "num");
        for (const algorithm of [1, 2, 3] as const) {
          const text = buildInstruction({ lang, native, level: 10 }, picks([longNumeral, ...nouns.slice(0, wordsPerResponse(10) - 1)]), grammar, null, algorithm, [], "a".repeat(120), numberCue(r, native));
          expect(text.length, `${lang} ${native} algo ${algorithm}`).toBeLessThanOrEqual(INSTRUCTION_BUDGET);
        }
      }
    }
  });

  test("the real data: a numeral pick for each language renders its digit line", () => {
    for (const lang of fullLangs) {
      const map = loadWordMapping(lang);
      const w = word("num-12", map["num-12"]!, "num");
      const rules = loadNumberRules(lang);
      const text = buildInstruction({ lang, native: "ru", level: 3 }, picks([w]), null, null, 3, [], null, rules[0] ? numberCue(rules[0], "ru") : null);
      expect(text, lang).toContain(`12 (**${map["num-12"]}**)`);
    }
  });

  test("existing rule machinery is untouched for languages and grammar", () => {
    for (const lang of fullLangs) {
      expect(() => pickPattern(loadPatterns(lang), "ru", {})).not.toThrow();
      expect(() => patternCue(loadPatterns(lang)[0]!, "uz", lang, falseFriendsFor(lang))).not.toThrow();
      expect(() => loadGrammar(lang)).not.toThrow();
    }
  });
});
