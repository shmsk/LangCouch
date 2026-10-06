import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { promptGlossLang } from "../src/glossLang.ts";
import { buildInstruction, INSTRUCTION_BUDGET } from "../src/instruction.ts";
import { pickWords } from "../src/scheduler.ts";
import { loadWordlist, loadGrammar, loadPatterns, falseFriendsFor } from "../src/store.ts";
import { patternCue } from "../src/patterns.ts";
import { wordsPerResponse } from "../src/types.ts";

describe("promptGlossLang", () => {
  type Unsure = null | "short" | "unknown";
  const cases: [string, string, string, Unsure][] = [
    // prompt, native, expected lang, unsure
    ["Давай дальнейшие планы построим", "en", "ru", null],
    ["Let's plan the next release", "en", "en", null],
    ["Let's plan the next release", "ru", "en", null],
    ["Keyingi rejani tuzamiz, oʻylab koʻraylik", "uz", "uz", null],
    ["Keyingi rejani tuzamiz", "en", "en", null], // Latin from an English-native user stays English
    ["Привіт, як справи? Це їхній дім", "en", "en", "unknown"], // Ukrainian: not Russian
    ["Привіт, як справи? Це їхній дім", "ru", "ru", "unknown"],
    ["Қандай қилиб тузатаман?", "uz", "uz", null], // Uzbek Cyrillic for an Uzbek speaker
    ["Қандай қилиб тузатаман?", "en", "en", "unknown"],
    ["Шта радиш? Ђе си ти данас", "en", "en", "unknown"], // Serbian
    ["", "en", "en", "short"],
    ["🙂👍", "ru", "ru", "short"],
    ["ok", "en", "en", "short"],
    ["да", "en", "en", "short"], // a confirmation must not spend the one question
    ["გამარჯობა, როგორ ხარ", "en", "en", "unknown"], // Georgian
  ];
  for (const [prompt, native, lang, unsure] of cases) {
    test(`${JSON.stringify(prompt)} with native ${native} → ${lang}${unsure ? " (unsure)" : ""}`, () => {
      expect(promptGlossLang(prompt, native)).toEqual({ lang, unsure });
    });
  }

  test("code, inline code and URLs don't count", () => {
    const prompt = "Почини это:\n```ts\nconst result = await fetchUserProfile(userId, { includeSettings: true });\n```\nсм. `loadConfigFromEnvironment` и https://example.com/some/long/english/path";
    expect(promptGlossLang(prompt, "en")).toEqual({ lang: "ru", unsure: null });
  });

  // shapes from real prompts (2026-10-01 review and history measurement)
  const russian = [
    "Сделай commit и потом push в main",
    "Сделай review PR #123, проверь useEffect dependencies и TypeScript types",
    "посмотри @src/cli.ts и @adapters/gemini/install.ts",
    "посмотри /Users/ks/Projects/Lazy Polyglot/src/glossLang.ts",
    "почему падает?\nTypeError: Cannot read properties of undefined (reading 'map')\n    at renderList (/Users/x/app/List.tsx:42:17)\n    at App (/Users/x/app/App.tsx:10:3)",
    "~~~\nconst fooBarBaz = computeSomethingVeryLong(argumentOne, argumentTwo)\n~~~\nпочини",
    "claim access with the same email tied to your paid subscription -- ты же сам написал?))",
  ];
  for (const prompt of russian) {
    test(`Russian with English inside: ${JSON.stringify(prompt.slice(0, 40))}`, () => {
      expect(promptGlossLang(prompt, "en").lang).toBe("ru");
    });
  }
});

describe("instruction with the ask line", () => {
  const words = loadWordlist("es");
  const ask = "Translations are in English: Lazy Polyglot couldn't tell this message's language. Once, in one short line after the answer, ask which language the user wants translations in (English, Russian or Uzbek); `lazy-polyglot native <en|ru|uz>` sets it.";

  test("fits the budget at max level in every algorithm, with grammar and a rule cue", () => {
    const picks = pickWords(words, {}, wordsPerResponse(10));
    const grammar = loadGrammar("es").reduce((a, b) => (JSON.stringify(b).length > JSON.stringify(a).length ? b : a));
    const rules = loadPatterns("es").map((p) => patternCue(p, "en", "es", falseFriendsFor("es")));
    const rule = rules.reduce((a, b) => (JSON.stringify(b).length > JSON.stringify(a).length ? b : a));
    for (const algo of [1, 2, 3] as const) {
      const text = buildInstruction({ lang: "es", native: "en", level: 10 }, picks, grammar, rule, algo, [], ask);
      expect(text).toContain("lazy-polyglot native");
      expect(text.length).toBeLessThanOrEqual(INSTRUCTION_BUDGET);
    }
  });

  test("the deliverables line names no language", () => {
    const picks = pickWords(words, {}, 3);
    const text = buildInstruction({ lang: "es", native: "ru", level: 2 }, picks, null, null, 3);
    expect(text).toContain("stays entirely free of Spanish words");
    expect(text).not.toContain("written entirely in");
  });
});

describe("hook picks the gloss language from the prompt", () => {
  const CLI = join(import.meta.dir, "..", "src", "cli.ts");
  const fresh = (config: object) => {
    const dir = mkdtempSync(join(tmpdir(), "lazy-polyglot-gloss-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify(config));
    return dir;
  };
  const hook = (dir: string, prompt: string, session = "s") =>
    spawnSync("bun", [CLI, "hook"], { env: { ...process.env, LAZY_POLYGLOT_DIR: dir }, input: JSON.stringify({ prompt, session_id: session, hook_event_name: "UserPromptSubmit" }), encoding: "utf8" }).stdout;
  const glosses = (out: string) => out.match(/= ([^;\n,]+)/g)?.join(" ") ?? "";

  test("Russian prompt → Russian glosses, English prompt → English, same config", () => {
    const dir = fresh({ lang: "es", native: "en", level: 2, algorithm: 3 });
    expect(glosses(hook(dir, "Давай построим план на следующий релиз"))).toMatch(/[а-я]/);
    const en = hook(dir, "Let's plan the next release together", "s2");
    expect(glosses(en)).not.toMatch(/[а-я]/);
    expect(en).toContain("<lazy-polyglot>");
  });

  test("an unsure prompt asks once, then never again", () => {
    const dir = fresh({ lang: "es", native: "en", level: 2, algorithm: 3 });
    expect(hook(dir, "ok", "s0")).not.toContain("lazy-polyglot native"); // too short to spend the question on
    expect(hook(dir, "გამარჯობა, როგორ ხარ")).toContain("lazy-polyglot native");
    expect(JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).nativeAsked).toBe(true);
    expect(hook(dir, "გამარჯობა, კიდევ ერთხელ", "s2")).not.toContain("lazy-polyglot native");
  });

  test("a clear prompt never asks", () => {
    const dir = fresh({ lang: "es", native: "en", level: 2, algorithm: 3 });
    expect(hook(dir, "Давай построим план")).not.toContain("lazy-polyglot native");
    expect(JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).nativeAsked).toBeUndefined();
  });

  test("`lazy-polyglot native` sets the language and stops the question; a bad code writes nothing", () => {
    const dir = fresh({ lang: "es", native: "en", level: 2 });
    const run = (...a: string[]) => spawnSync("bun", [CLI, "native", ...a], { env: { ...process.env, LAZY_POLYGLOT_DIR: dir }, encoding: "utf8" });
    expect(run("ru").status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "config.json"), "utf8"))).toMatchObject({ native: "ru", nativeAsked: true });
    const before = readFileSync(join(dir, "config.json"), "utf8");
    expect(run("de").status).toBe(1);
    expect(readFileSync(join(dir, "config.json"), "utf8")).toBe(before);
  });
});
