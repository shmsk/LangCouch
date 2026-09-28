import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DATA_DIR as dir, // sandboxed by tests/setup.ts
  availableLangs,
  baseLang,
  falseFriendsFor,
  loadPatterns,
  loadState,
  loadWordMapping,
  saveState,
} from "../src/store.ts";
import { pickPattern, patternCue, patternKey, patternProgress, markPatternShown, INTRODUCED_AFTER, type Pattern } from "../src/patterns.ts";
import { buildInstruction } from "../src/instruction.ts";
import { pickWords } from "../src/scheduler.ts";
import { wordsPerResponse, type Word } from "../src/types.ts";

const rule = (id: string, from: Record<string, string>, to: string): Pattern => ({
  id,
  from,
  to,
  examples: [{ target: `x${to}`, gloss: { en: `x${from.en ?? ""}`, ru: `x${from.ru ?? ""}` } }],
  source: "https://example.org",
});
const tion = rule("tion", { en: "-tion", ru: "-ция" }, "-ción");
const ity = rule("ity", { en: "-ity", ru: "-итет" }, "-dad");
const irovat = rule("irovat", { ru: "-ировать" }, "-ar");
const rules = [tion, ity, irovat];
const shownTimes = (n: number) => ({ exposures: n, lastSeen: "2026-09-01T00:00:00Z" });

describe("picking a word-building rule", () => {
  test("teaches in file order, one rule until it is introduced", () => {
    expect(pickPattern(rules, "ru", {})?.id).toBe("tion");
    expect(pickPattern(rules, "ru", { [patternKey("tion")]: shownTimes(INTRODUCED_AFTER - 1) })?.id).toBe("tion");
    expect(pickPattern(rules, "ru", { [patternKey("tion")]: shownTimes(INTRODUCED_AFTER) })?.id).toBe("ity");
  });

  test("once all are introduced, the least shown comes back", () => {
    const state = { [patternKey("tion")]: shownTimes(5), [patternKey("ity")]: shownTimes(3), [patternKey("irovat")]: shownTimes(4) };
    expect(pickPattern(rules, "ru", state)?.id).toBe("ity");
  });

  test("a rule without a parallel in the native language is skipped; others fall back to English", () => {
    const allOthers = { [patternKey("tion")]: shownTimes(9), [patternKey("ity")]: shownTimes(9) };
    expect(pickPattern(rules, "en", allOthers)?.id).not.toBe("irovat");
    expect(patternProgress(rules, "en", {}).total).toBe(2);
    expect(patternProgress(rules, "ru", {}).total).toBe(3);
    expect(pickPattern([tion], "uz", {})).toBe(tion); // no uz key: the English suffix is shown
    expect(pickPattern([irovat], "en", {})).toBeNull();
  });

  test("progress counts introduced rules and names the next one", () => {
    const state = markPatternShown({ [patternKey("tion")]: shownTimes(INTRODUCED_AFTER - 1) }, tion, "2026-09-02T00:00:00Z");
    expect(state[patternKey("tion")]?.exposures).toBe(INTRODUCED_AFTER);
    expect(patternProgress(rules, "ru", state)).toEqual({ total: 3, introduced: 1, next: { from: "-итет", to: "-dad" } });
  });
});

describe("the rule in the instruction", () => {
  const words: Word[] = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, target: `palabra${i}`, pos: "noun", tier: 1, gloss: { en: `word${i}` } }));

  test("shows the native suffix, an example, false friends and rude words to avoid", () => {
    const cue = patternCue(tion, "ru", "es-419", [
      { target: "actual", means: "current", register: "neutral", pattern: "tion", source: "https://x" },
      { target: "otro", means: "other", register: "neutral", pattern: "ity", source: "https://x" },
      { target: "coger", means: "to take", register: "vulgar", vulgarIn: ["es-419"], source: "https://x" },
    ]);
    expect(cue).toEqual({ from: "-ция", to: "-ción", example: "x-ción = x-ция", notThese: ["actual = current"], avoid: ["coger"] });
    const text = buildInstruction({ lang: "es-419", native: "ru", level: 2 }, pickWords(words, {}, 3), null, cue);
    expect(text).toContain("Word-building rule: -ция → -ción (e.g. x-ción = x-ция)");
    expect(text).toContain("False friends, not this rule: actual = current.");
    expect(text).toContain("Never use: coger.");
    expect(text).toContain("weaving words not on the list (the one rule word aside)");
    expect(patternCue(tion, "ru", "es", [{ target: "coger", means: "to take", register: "vulgar", vulgarIn: ["es-419"], source: "https://x" }]).avoid).toEqual([]);
  });

  test("no rule, no rule line", () => {
    const text = buildInstruction({ lang: "es", native: "ru", level: 2 }, pickWords(words, {}, 3));
    expect(text).not.toContain("Word-building rule");
    expect(text).toContain("weaving words not on the list.");
  });

  test("words, a construction and a rule together stay within the 2400-char budget", () => {
    const longest = [...availableLangs()].flatMap((l) => loadPatterns(l)).sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0] ?? tion;
    const cue = patternCue(longest, "ru", "es-419", falseFriendsFor("es-419"));
    const grammar = { id: "g", pattern: "p".repeat(80), exampleTarget: "t".repeat(30), exampleGloss: "g".repeat(30), baseExample: "b".repeat(30), unlock: { pos: "noun" as const, absorbedCount: 1 } };
    const text = buildInstruction({ lang: "es-419", native: "ru", level: 10 }, pickWords(words, {}, wordsPerResponse(10)), grammar, cue);
    expect(text.length).toBeLessThanOrEqual(2400);
  });
});

describe("rule progress in a regional variant", () => {
  const userPatterns = join(dir, "patterns");
  const statePath = (l: string) => join(dir, `state.${l}.json`);

  test("is shared with the base", () => {
    mkdirSync(userPatterns, { recursive: true });
    writeFileSync(join(userPatterns, "pt.json"), JSON.stringify([tion]));
    for (const l of ["pt", "pt-BR"]) rmSync(statePath(l), { force: true });
    try {
      expect(loadPatterns("pt-BR").map((p) => p.id)).toEqual(["tion"]);
      saveState("pt-BR", { [patternKey("tion")]: shownTimes(2) });
      expect(JSON.parse(readFileSync(statePath("pt"), "utf8"))[patternKey("tion")]).toEqual(shownTimes(2));
      expect(loadState("pt")[patternKey("tion")]).toEqual(shownTimes(2));
    } finally {
      rmSync(userPatterns, { recursive: true, force: true });
      for (const l of ["pt", "pt-BR"]) rmSync(statePath(l), { force: true });
    }
  });
});

describe("bundled patterns/ and falseFriends/", () => {
  const root = join(import.meta.dir, "..");
  const files = (sub: string) => (existsSync(join(root, sub)) ? readdirSync(join(root, sub)).filter((f) => f.endsWith(".json")) : []);

  test("every rule is complete and sourced, with 3 examples and unique ids", () => {
    for (const file of files("patterns")) {
      const lang = file.replace(/\.json$/, "");
      const list = loadPatterns(lang);
      expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
      for (const p of list) {
        expect(p.id).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(Object.keys(p.from).length).toBeGreaterThan(0);
        expect(p.to).toMatch(/^-\S+$/);
        expect(p.source).toMatch(/^https:\/\//);
        expect(p.examples).toHaveLength(3);
        for (const ex of p.examples) {
          expect(ex.target.length).toBeGreaterThan(0);
          expect(Object.keys(ex.gloss).length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("false friends name a real rule and never show up as a rule's example", () => {
    for (const file of files("falseFriends")) {
      const lang = file.replace(/\.json$/, "");
      const ids = new Set(loadPatterns(lang).map((p) => p.id));
      const examples = new Set(loadPatterns(lang).flatMap((p) => p.examples.map((e) => e.target)));
      for (const f of falseFriendsFor(lang)) {
        expect(f.source).toMatch(/^https:\/\//);
        if (f.pattern && baseLang(lang) === null) expect(ids.has(f.pattern)).toBe(true);
        expect(examples.has(f.target)).toBe(false);
      }
    }
  });

  test("no rude word is ever a rule example in a language or its variants", () => {
    for (const lang of availableLangs()) {
      const rude = new Set(falseFriendsFor(lang).filter((f) => f.register === "vulgar" && (f.vulgarIn ?? []).includes(lang)).map((f) => f.target));
      const examples = loadPatterns(lang).flatMap((p) => p.examples.map((e) => e.target));
      expect(examples.filter((e) => rude.has(e))).toEqual([]);
      expect(Object.values(loadWordMapping(lang)).filter((w) => rude.has(w))).toEqual([]);
    }
  });
});
