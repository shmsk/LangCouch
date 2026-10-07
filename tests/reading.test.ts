import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { cleanIpa, readingOf, renderReading, type ReadingMode } from "../src/reading.ts";
import { buildInstruction, INSTRUCTION_BUDGET } from "../src/instruction.ts";
import { loadWordlist, loadWordMapping } from "../src/store.ts";
import { pickWords, type Pick } from "../src/scheduler.ts";
import { wovenLemmas, wovenPairs, matchServed } from "../src/weave-detect.ts";
import { cardQueue } from "../src/cards.ts";
import { tipFor } from "../src/spinner.ts";
import type { Config, Word } from "../src/types.ts";

const READINGS = join(import.meta.dir, "..", "data", "readings");
const files = readdirSync(READINGS).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
const NATIVES = ["ru", "en", "uz"];
const read = (lang: string): Record<string, string> => JSON.parse(readFileSync(join(READINGS, `${lang}.json`), "utf8"));

describe("bundled readings", () => {
  test("fr, en and pt ship readings, with en-GB and pt-BR overlays", () => {
    expect(files.sort()).toEqual(["en", "en-GB", "fr", "pt", "pt-BR"]);
  });

  test.each(["fr", "en", "en-GB", "pt", "pt-BR"])("every %s word has a reading", (lang) => {
    const missing = loadWordlist(lang).filter((w) => !w.ipa).map((w) => w.id);
    expect(missing).toEqual([]);
  });

  test.each(files)("%s maps only concepts of its wordlist, to plain IPA", (lang) => {
    const ids = new Set(Object.keys(loadWordMapping(lang)));
    for (const [id, ipa] of Object.entries(read(lang))) {
      expect(ids.has(id), `${lang}: ${id}`).toBe(true);
      expect(ipa, `${lang}: ${id}`).toMatch(/^[^/[\]()~,]+$/);
    }
  });

  test.each(["en-GB", "pt-BR"])("%s gives its own reading to every word it spells differently", (lang) => {
    const own = read(lang);
    const variant = JSON.parse(readFileSync(join(import.meta.dir, "..", "data", "wordlists", `${lang}.json`), "utf8")) as Record<string, string>;
    for (const id of Object.keys(variant)) expect(own[id], `${lang}: ${id}`).toBeDefined();
  });

  // every IPA string in every file, rendered for every native language: no IPA symbol may survive
  const ALPHABET: Record<string, RegExp> = { ru: /^[а-яё́ -]+$/u, en: /^[a-zA-Z -]+$/, uz: /^[a-zʻʼ -]+$/ };
  for (const lang of files) {
    for (const native of NATIVES) {
      if (native === lang.split("-")[0]) continue; // an English speaker learning English gets IPA
      test(`${lang} → ${native}: every reading is spelled in ${native} letters`, () => {
        const bad = Object.entries(read(lang))
          .map(([id, ipa]) => [id, ipa, renderReading(ipa, "native", native, lang)] as const)
          .filter(([, , out]) => !ALPHABET[native]!.test(out.normalize("NFC")));
        expect(bad).toEqual([]);
      });
    }
  }
});

describe("renderReading", () => {
  const cases: [string, string, string, string][] = [
    // ipa, lang, native, expected
    ["wa.zo", "fr", "ru", "уазо́"],
    ["wa.zo", "fr", "en", "wah-ZOH"],
    ["wa.zo", "fr", "uz", "uazo"],
    ["mɛ.zɔ̃", "fr", "ru", "мезо́н"],
    ["pɐ̃w̃", "pt", "ru", "паун"],
    ["kõ.pu.taˈdoʁ", "pt-BR", "ru", "компутадо́р"],
    ["ˈpɐj.ʃɨ", "pt", "en", "PAY-shih"],
    ["ˈjɪɚ", "en", "ru", "йиэр"],
    ["ˈtaɪ.mɚ", "en", "ru", "та́ймэр"],
    ["haʊs", "en", "uz", "haus"],
    ["ʁe.ʒjɔ̃", "fr", "ru", "режьён"],
  ];
  for (const [ipa, lang, native, expected] of cases) {
    test(`${ipa} (${lang}) for ${native} → ${expected}`, () => expect(renderReading(ipa, "native", native, lang)).toBe(expected));
  }

  test("ipa mode shows the IPA cleaned of slashes and syllable dots, the same for everyone", () => {
    for (const native of NATIVES) expect(renderReading("ˈwɔ.tɚ", "ipa", native, "en")).toBe("ˈwɔtɚ");
    expect(cleanIpa("/mɛ.zɔ̃/")).toBe("mɛzɔ̃");
  });

  test("off shows nothing; a learner of their own language gets IPA", () => {
    expect(renderReading("wa.zo", "off", "ru", "fr")).toBe("");
    expect(renderReading("ˈwɔ.tɚ", "native", "en", "en")).toBe("ˈwɔtɚ");
  });
});

describe("readingOf", () => {
  const config: Config = { lang: "fr", native: "ru", level: 2 };
  test("native by default where readings exist, off where they don't, the choice otherwise", () => {
    expect(readingOf(config, "fr", true)).toBe("native");
    expect(readingOf(config, "es", false)).toBe("off");
    expect(readingOf({ ...config, reading: { fr: "ipa" } }, "fr", true)).toBe("ipa");
    expect(readingOf({ ...config, reading: { fr: "ipa" } }, "pt", true)).toBe("native");
  });
});

describe("instruction with readings", () => {
  const words = loadWordlist("fr");
  const config: Config = { lang: "fr", native: "ru", level: 2 };
  const reading = (mode: ReadingMode) => (w: Word) => (w.ipa ? renderReading(w.ipa, mode, config.native, config.lang) : "");

  test("off is byte-identical to an instruction built without readings", () => {
    const picks = pickWords(words, {}, 5);
    for (const alg of [1, 2, 3] as const) {
      expect(buildInstruction(config, picks, null, null, alg, [], null, null, reading("off"))).toBe(buildInstruction(config, picks, null, null, alg));
    }
  });

  test("new and nudge words carry the reading, familiar ones never do", () => {
    const [a, b, c] = words;
    const picks: Pick[] = [
      { word: a!, exposures: 0, step: 0 },
      { word: b!, exposures: 3, step: 3 },
      { word: c!, exposures: 6, step: 6, nudge: true },
    ];
    const text = buildInstruction(config, picks, null, null, 3, [], null, null, reading("native"));
    const line = (prefix: string) => text.split("\n").find((l) => l.startsWith(prefix)) ?? "";
    expect(line("New, translation inline")).toContain(`${a!.target} [${renderReading(a!.ipa!, "native", "ru", "fr")}] = `);
    expect(line("Familiar")).toContain(`${b!.target} = `);
    expect(line("Familiar")).not.toContain("[");
    expect(line("Nudge")).toContain(`${c!.target} [`);
    expect(text).toContain("**word** [pronunciation] (translation)");
  });

  test("algorithms 1 and 2 show the reading on every word", () => {
    const picks = pickWords(words, {}, 4);
    const text = buildInstruction(config, picks, null, null, 2, [], null, null, reading("ipa"));
    for (const p of picks) expect(text).toContain(`${p.word.target} [${cleanIpa(p.word.ipa!)}] = `);
    expect(text).toContain("**word** [pronunciation] (translation) on first appearance");
  });

  test("with readings on, a level-10 instruction stays within budget", () => {
    const known = words.slice(100, 300);
    for (const native of NATIVES) {
      const c = { ...config, native, level: 10 };
      const picks = pickWords(words, {}, 12).map((p, i) => ({ ...p, step: i % 2 ? 0 : 1, ...(i === 0 ? { nudge: true } : {}) }));
      const text = buildInstruction(c, picks, null, null, 3, known, null, null, (w) => (w.ipa ? renderReading(w.ipa, "native", native, c.lang) : ""));
      expect(text.length).toBeLessThanOrEqual(INSTRUCTION_BUDGET);
    }
  });
});

describe("weave detection with a reading", () => {
  const reply = "Сегодня **maison** [мезо́н] (дом) стоит, и **jour** (день) тоже.";
  test("**word** [reading] (translation) is a woven pair", () => {
    expect(wovenPairs(reply)).toEqual([{ word: "maison", gloss: "дом" }, { word: "jour", gloss: "день" }]);
    expect(matchServed(reply, ["maison", "jour", "temps"])).toEqual(["maison", "jour"]);
    expect(wovenLemmas(reply, ["maison", "jour", "temps"])).toEqual(["maison", "jour"]);
  });
});

describe("cards and spinner show the reading", () => {
  const words = loadWordlist("fr");
  test("forward cards carry the reading; reverse cards and readings off don't", () => {
    const config: Config = { lang: "fr", native: "ru", level: 2 };
    const [card] = cardQueue(words, {}, config, 1, new Date().toISOString());
    expect(card!.reading).toBe(renderReading(words.find((w) => w.id === card!.id)!.ipa!, "native", "ru", "fr"));
    const [off] = cardQueue(words, {}, { ...config, reading: { fr: "off" } }, 1, new Date().toISOString());
    expect(off!.reading).toBeUndefined();
    expect(cardQueue(loadWordlist("es"), {}, { ...config, lang: "es" }, 1, new Date().toISOString())[0]!.reading).toBeUndefined();
  });

  test("a spinner tip puts the reading after the word", () => {
    const w = words[0]!;
    expect(tipFor(w, "ru", "мезо́н")).toEndWith(`${w.target} [мезо́н] = ${w.gloss.ru}`);
    expect(tipFor(w, "ru")).toEndWith(`${w.target} = ${w.gloss.ru}`);
  });
});

describe("the CLI", () => {
  const CLI = join(import.meta.dir, "..", "src", "cli.ts");
  const fresh = (config: object) => {
    const dir = mkdtempSync(join(tmpdir(), "lazy-polyglot-reading-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify(config));
    return dir;
  };
  const env = (dir: string) => ({ ...process.env, LAZY_POLYGLOT_DIR: dir });
  const hook = (dir: string, prompt: string, session: string) =>
    spawnSync("bun", [CLI, "hook"], { env: env(dir), input: JSON.stringify({ prompt, session_id: session, hook_event_name: "UserPromptSubmit" }), encoding: "utf8" }).stdout;
  const run = (dir: string, ...args: string[]) => spawnSync("bun", [CLI, ...args], { env: env(dir), encoding: "utf8" });
  const config = (dir: string) => JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));

  test("asks once with three real examples, never alongside another question, never again", () => {
    const dir = fresh({ lang: "fr", native: "ru", level: 2, algorithm: 3 });
    const first = hook(dir, "Давай построим план на неделю", "s1");
    expect(first).toContain("lazy-polyglot:placement"); // the placement offer comes first, alone
    expect(first).not.toContain("lazy-polyglot:reading");
    const second = hook(dir, "Давай построим план на месяц", "s2");
    expect(second).toMatch(/none: \S+ \([^)]+\) · Russian letters: \S+ \[[а-яё́]+\] \([^)]+\) · IPA: \S+ \[[^\]]+\] \([^)]+\)/u);
    expect(config(dir).readingAsked).toEqual(["fr"]);
    expect(hook(dir, "Давай построим план на год", "s3")).not.toContain("lazy-polyglot:reading");
  });

  test("the reading follows the language the user wrote in", () => {
    const dir = fresh({ lang: "fr", native: "en", level: 2, algorithm: 3, placementOffered: ["fr"], readingAsked: ["fr"] });
    expect(hook(dir, "Давай построим план на неделю", "s1")).toMatch(/New, translation inline: \S+ \[[а-яё́]+\] = [а-я]/u);
    expect(hook(dir, "Let us plan the next week together", "s2")).toMatch(/New, translation inline: \S+ \[[a-zA-Z-]+\] = [a-z]/);
  });

  test("a language without readings never asks and shows none", () => {
    const dir = fresh({ lang: "es", native: "ru", level: 2, algorithm: 3, placementOffered: ["es"] });
    const out = hook(dir, "Давай построим план на неделю", "s1");
    expect(out).not.toContain("lazy-polyglot:reading");
    expect(out).not.toContain("[pronunciation]");
    expect(run(dir, "reading").stdout).toContain("reads as it is written");
  });

  test("`reading` shows the three choices and switches; a bad mode writes nothing", () => {
    const dir = fresh({ lang: "pt", native: "uz", level: 2 });
    const status = run(dir, "reading").stdout;
    expect(status).toContain("Pronunciation of new Portuguese words: native");
    expect(status).toMatch(/off +\S+ \(/);
    expect(status).toMatch(/ipa +\S+ \[/);
    expect(run(dir, "reading", "ipa").status).toBe(0);
    expect(config(dir)).toMatchObject({ reading: { pt: "ipa" }, readingAsked: ["pt"] });
    const before = readFileSync(join(dir, "config.json"), "utf8");
    expect(run(dir, "reading", "loud").status).toBe(1);
    expect(readFileSync(join(dir, "config.json"), "utf8")).toBe(before);
  });

  test("`lang fr` shows the pronunciation choices with an example", () => {
    const dir = fresh({ lang: "es", native: "ru", level: 2 });
    const out = run(dir, "lang", "fr").stdout;
    expect(out).toContain("Pronunciation of new words: native");
    expect(out).toMatch(/native +\S+ \[[а-яё́]+\]/u);
  });

  test("export and import carry the setting and a user readings file", () => {
    const dir = fresh({ lang: "fr", native: "ru", level: 2, reading: { fr: "ipa" }, readingAsked: ["fr"] });
    spawnSync("mkdir", ["-p", join(dir, "readings")]);
    writeFileSync(join(dir, "readings", "fr.json"), JSON.stringify({ house: "mɛ.zɔ̃" }));
    const bundle = join(mkdtempSync(join(tmpdir(), "lazy-polyglot-reading-out-")), "export.json");
    expect(run(dir, "export", bundle).status).toBe(0);
    const to = mkdtempSync(join(tmpdir(), "lazy-polyglot-reading-to-"));
    expect(run(to, "import", bundle).status).toBe(0);
    expect(config(to)).toMatchObject({ reading: { fr: "ipa" }, readingAsked: ["fr"] });
    expect(JSON.parse(readFileSync(join(to, "readings", "fr.json"), "utf8"))).toEqual({ house: "mɛ.zɔ̃" });
  });
});
