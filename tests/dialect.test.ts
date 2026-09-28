import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  DATA_DIR as dir, // sandboxed by tests/setup.ts
  availableLangs,
  baseLang,
  langsWithState,
  loadGrammar,
  loadFalseFriends,
  loadWordMapping,
  loadState,
  loadWordlist,
  normalizeLang,
  saveState,
  wordlistLayers,
  WORDLISTS_DIR,
  CONCEPTS_PATH,
} from "../src/store.ts";
import { validateConcepts, validateMapping } from "../src/validate.ts";
import { buildInstruction, langName } from "../src/instruction.ts";
import { pickWords, tierProgress } from "../src/scheduler.ts";
import { pickGrammar, grammarKey } from "../src/grammar.ts";
import { isAbsorbed } from "../src/types.ts";

const userWordlists = join(dir, "wordlists");
const userGrammar = join(dir, "grammar");
const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const bundledPt = JSON.parse(readFileSync(join(WORDLISTS_DIR, "pt.json"), "utf8")) as Record<string, string>;
const overlay = { phone: "celular", car: "automóvel" }; // neither word is in pt.json

function reset() {
  rmSync(userWordlists, { recursive: true, force: true });
  rmSync(userGrammar, { recursive: true, force: true });
}

function writeVariant(code: string, data: Record<string, string>) {
  mkdirSync(userWordlists, { recursive: true });
  writeFileSync(join(userWordlists, `${code}.json`), JSON.stringify(data));
}

function cli(...args: string[]) {
  const r = spawnSync("bun", [CLI, ...args], { env: { ...process.env, LANGCOUCH_DIR: dir }, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

describe("regional variants (pt-BR over pt)", () => {
  test("codes normalize to BCP 47 case", () => {
    expect(normalizeLang("pt-br")).toBe("pt-BR");
    expect(normalizeLang("PT_BR")).toBe("pt-BR");
    expect(normalizeLang("es-419")).toBe("es-419");
    expect(normalizeLang("latam")).toBe("es-419");
    expect(normalizeLang(" LATAM ")).toBe("es-419");
    expect(normalizeLang("pt")).toBe("pt");
    expect(baseLang("pt-BR")).toBe("pt");
    expect(baseLang("pt")).toBeNull();
    expect(langName("pt-BR")).toBe("Brazilian Portuguese");
  });

  test("the overlay wins, the base supplies every other word", () => {
    reset();
    writeVariant("pt-BR", overlay);
    expect(availableLangs()).toContain("pt-BR");
    const words = new Map(loadWordlist("pt-BR").map((w) => [w.id, w.target]));
    expect(words.get("phone")).toBe("celular");
    expect(words.get("house")).toBe(bundledPt.house!);
    expect(words.size).toBe(Object.keys({ ...bundledPt, ...overlay }).length);
    expect(loadWordlist("pt").find((w) => w.id === "phone")?.target).toBe(bundledPt.phone!); // base untouched
    expect(loadWordlist("pt-br").find((w) => w.id === "phone")?.target).toBe("celular"); // lowercase code resolves
  });

  test("a variant without its base is a clear error", () => {
    reset();
    writeVariant("xx-YY", overlay);
    expect(() => wordlistLayers("xx-YY")).toThrow(/variant of "xx"/);
  });

  test("grammar falls back to the base, a variant file overlays it", () => {
    reset();
    const base = loadGrammar("es");
    expect(loadGrammar("es-MX")).toEqual(base);
    const item = { id: "g1", pattern: "p", exampleTarget: "t", exampleGloss: "g", unlock: { pos: "noun" as const, absorbedCount: 1 } };
    const replaced = { ...base[0]!, exampleTarget: "otra" };
    mkdirSync(userGrammar, { recursive: true });
    writeFileSync(join(userGrammar, "es-MX.json"), JSON.stringify([item, replaced]));
    expect(loadGrammar("es-MX")).toEqual([replaced, ...base.slice(1), item]);
  });

  test("progress is kept in its own state file and shows up in status", () => {
    reset();
    saveState("pt-BR", { phone: { exposures: 1, lastSeen: new Date().toISOString() } });
    expect(existsSync(join(dir, "state.pt-BR.json"))).toBe(true);
    expect(langsWithState()).toContain("pt-BR");
  });

  test("validator: merged over-shared words and base copies are caught", () => {
    const { concepts } = validateConcepts(CONCEPTS_PATH);
    const base = join(WORDLISTS_DIR, "pt.json");
    reset();
    writeVariant("pt-BR", overlay);
    const ok = validateMapping([base, join(userWordlists, "pt-BR.json")], concepts, true);
    expect(ok.errors).toEqual([]);
    expect(ok.overrides).toBe(2);

    writeVariant("pt-BR", { phone: bundledPt.house!, car: bundledPt.house!, house: bundledPt.house!, nope: "x" });
    const bad = validateMapping([base, join(userWordlists, "pt-BR.json")], concepts, true);
    expect(bad.errors.some((e) => e.includes("at most 2 may share a word"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("same as the base word"))).toBe(true);
    expect(bad.errors.some((e) => e.includes('"nope": unknown concept'))).toBe(true);

    writeVariant("pt-BR", { phone: bundledPt.house! });
    const pair = validateMapping([base, join(userWordlists, "pt-BR.json")], concepts, true);
    expect(pair.errors).toEqual([]);
    expect(pair.shared.some((s) => s.startsWith(`${bundledPt.house} (`))).toBe(true);
  });

  test("CLI: lang pt-br switches, lists the variant, validate passes", () => {
    reset();
    writeVariant("pt-BR", overlay);
    expect(cli("init").code).toBe(0);
    const sw = cli("lang", "pt-br");
    expect(sw.code).toBe(0);
    expect(sw.out).toContain("→ pt-BR");
    const list = cli("lang");
    expect(list.out).toContain("pt-BR Brazilian Portuguese — variant of pt, 2 words differ (local)");
    expect(cli("instruction").out).toContain("Brazilian Portuguese");
    const v = cli("validate", "pt-BR", "--full");
    expect(v.code).toBe(0);
    expect(v.out).toContain("variant: 2 overrides");
    expect(cli("lang", "es").code).toBe(0); // leave the shared sandbox as other tests expect it
    reset();
  });
});

describe("native gloss keys", () => {
  test("an optional gloss key must cover every concept", () => {
    const list = JSON.parse(readFileSync(CONCEPTS_PATH, "utf8")) as { gloss: Record<string, string> }[];
    list[0]!.gloss.xx = "half-filled";
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "concepts-partial.json");
    writeFileSync(path, JSON.stringify(list));
    const { errors } = validateConcepts(path);
    expect(errors.some((e) => e.startsWith(`gloss.xx missing on ${list.length - 1} concepts`))).toBe(true);
    rmSync(path);
  });
});

// Someone who learned the base and switches to a variant keeps the shared words;
// only the variant's own lemmas are new. Same rule for every variant, checked on two.
describe.each([
  { variant: "es-419", base: "es", shared: "house", regional: "car", own: "carro", baseWord: "coche", region: "Spain" },
  { variant: "pt-BR", base: "pt", shared: "house", regional: "train", own: "trem", baseWord: "comboio", region: "Portugal" },
])("variant progress shares the base pool ($variant over $base)", ({ variant, base, shared, regional, own, baseWord, region }) => {
  const absorbed = { exposures: 3, recalls: 2, lastSeen: "2026-09-01T00:00:00Z" };
  const statePath = (l: string) => join(dir, `state.${l}.json`);
  const readFile = (l: string) => JSON.parse(readFileSync(statePath(l), "utf8"));
  function clean() {
    reset();
    for (const l of [variant, base]) rmSync(statePath(l), { force: true });
  }

  test("an absorbed shared word stays absorbed, a differing one starts fresh", () => {
    clean();
    saveState(base, { [shared]: absorbed, [regional]: absorbed });
    const state = loadState(variant);
    expect(isAbsorbed(state[shared])).toBe(true);
    expect(state[regional]).toBeUndefined(); // knowing coche is not knowing carro
    const words = loadWordlist(variant);
    const t1 = words.filter((w) => w.tier === 1);
    expect(tierProgress(words, state)[0]!.absorbed).toBe(t1.filter((w) => isAbsorbed(state[w.id])).length);
  });

  test("progress made in the variant lands in the right file", () => {
    clean();
    saveState(base, { [regional]: absorbed });
    const state = loadState(variant);
    state[shared] = { exposures: 5, lastSeen: "2026-09-02T00:00:00Z" };
    state[regional] = { exposures: 1, lastSeen: "2026-09-02T00:00:00Z" };
    saveState(variant, state);
    expect(readFile(base)[shared].exposures).toBe(5); // shared word counts for the base too
    expect(readFile(base)[regional]).toEqual(absorbed); // the base's own coche untouched
    expect(readFile(variant)).toEqual({ [regional]: state[regional] });
    expect(loadState(base)[shared]?.exposures).toBe(5);
  });

  test("a legacy variant file folds into the base without losing progress", () => {
    clean();
    saveState(base, { [shared]: { exposures: 4, lastSeen: "2026-08-01T00:00:00Z" } });
    writeFileSync(statePath(variant), JSON.stringify({ [shared]: { exposures: 2, recalls: 1, lastSeen: "2026-09-01T00:00:00Z" } }));
    const merged = loadState(variant)[shared]!;
    expect(merged).toEqual({ exposures: 4, recalls: 1, lastSeen: "2026-09-01T00:00:00Z" });
    saveState(variant, loadState(variant));
    expect(readFile(variant)[shared]).toBeUndefined();
    expect(readFile(base)[shared]).toEqual(merged);
  });

  test("regional words carry the base lemma, lead the picks, and show as a contrast", () => {
    clean();
    const words = loadWordlist(variant);
    expect(words.find((w) => w.id === regional)?.baseTarget).toBe(baseWord);
    expect(words.find((w) => w.id === shared)?.baseTarget).toBeUndefined();
    const regionalCount = words.filter((w) => w.baseTarget).length;
    const picks = pickWords(words, {}, regionalCount);
    expect(picks.every((p) => p.word.baseTarget)).toBe(true);
    const text = buildInstruction({ lang: variant, native: "en", level: 2 }, picks);
    expect(text).toContain(`${own} = ${words.find((w) => w.id === regional)!.gloss.en}, ${region}: ${baseWord}`);
  });

  test("status reports the regional split", () => {
    clean();
    const cfg = join(dir, "config.json");
    const before = existsSync(cfg) ? readFileSync(cfg, "utf8") : null;
    writeFileSync(cfg, JSON.stringify({ lang: variant, native: "en", level: 2 }));
    const { out } = cli("status");
    if (before === null) rmSync(cfg);
    else writeFileSync(cfg, before);
    expect(out).toMatch(new RegExp(`Regional \\(vs ${base}\\): 0/\\d+ absorbed · \\d+ words share progress with ${base}`));
  });
});

describe("regional grammar (es-419 over es)", () => {
  const statePath = (l: string) => join(dir, `state.${l}.json`);
  const readFile = (l: string) => JSON.parse(readFileSync(statePath(l), "utf8"));
  const seen = { exposures: 2, lastSeen: "2026-09-01T00:00:00Z" };
  function clean() {
    reset();
    for (const l of ["es", "es-419"]) rmSync(statePath(l), { force: true });
  }
  // every word absorbed, so every construction's POS threshold is met
  const words = loadWordlist("es-419");
  const allAbsorbed = Object.fromEntries(words.map((w) => [w.id, { exposures: 3, recalls: 2, lastSeen: "2026-09-01T00:00:00Z" }]));

  test("the overlay adds regional constructions after the base's, each with a source", () => {
    const base = loadGrammar("es");
    const grammar = loadGrammar("es-419");
    expect(grammar.slice(0, base.length)).toEqual(base);
    const regional = grammar.filter((g) => g.baseExample);
    expect(regional.map((g) => g.id)).toEqual(["plural-you", "recent-past"]);
    for (const g of regional) expect(g.source).toMatch(/^https:\/\//);
  });

  test("regional constructions are picked first, and only from their stage on", () => {
    const grammar = loadGrammar("es-419");
    expect(pickGrammar(grammar, words, allAbsorbed, 2)?.id).toBe("plural-you"); // recent-past is stage 3
    const shownOnce = { ...allAbsorbed, [grammarKey("plural-you")]: seen };
    expect(pickGrammar(grammar, words, shownOnce, 3)?.id).toBe("recent-past");
    expect(pickGrammar(loadGrammar("es"), words, allAbsorbed, 2)?.baseExample).toBeUndefined();
  });

  test("shared construction progress lives with the base, regional stays in the variant", () => {
    clean();
    saveState("es", { [grammarKey("def-article")]: seen });
    const state = loadState("es-419");
    expect(state[grammarKey("def-article")]).toEqual(seen); // learned in es, known in es-419
    state[grammarKey("plural-you")] = seen;
    saveState("es-419", state);
    expect(readFile("es-419")).toEqual({ [grammarKey("plural-you")]: seen });
    expect(readFile("es")[grammarKey("plural-you")]).toBeUndefined();
  });

  test("the instruction shows the Spain form next to the regional one", () => {
    const grammar = loadGrammar("es-419").find((g) => g.id === "plural-you")!;
    const picks = pickWords(words, {}, 5);
    const text = buildInstruction({ lang: "es-419", native: "en", level: 5 }, picks, grammar);
    expect(text).toContain("e.g. ustedes trabajan (you all work; Spain: vosotros trabajáis)");
    expect(buildInstruction({ lang: "es-419", native: "en", level: 10 }, pickWords(words, {}, 12), grammar).length).toBeLessThanOrEqual(2400);
  });
});

describe("rude words", () => {
  const bundled = availableLangs();

  test("every falseFriends entry is sourced, and vulgar ones say where", () => {
    for (const lang of bundled) {
      for (const f of loadFalseFriends(lang)) {
        expect(f.source).toMatch(/^https:\/\//);
        if (f.register === "vulgar") expect(f.vulgarIn?.length).toBeGreaterThan(0);
      }
    }
  });

  test("no language teaches a word that is rude in that language", () => {
    for (const lang of bundled) {
      const base = baseLang(lang);
      const rude = [...loadFalseFriends(lang), ...(base ? loadFalseFriends(base) : [])]
        .filter((f) => f.register === "vulgar" && (f.vulgarIn ?? []).includes(lang))
        .map((f) => f.target);
      const lemmas = new Set(Object.values(loadWordMapping(lang)));
      expect(rude.filter((w) => lemmas.has(w))).toEqual([]); // es-419 must keep tomar over coger
    }
  });

  test("the Spain contrast for tomar warns about coger", () => {
    const tomar = loadWordlist("es-419").find((w) => w.target === "tomar")!;
    expect(tomar.baseNote).toBe("vulgar in much of Latin America");
    const text = buildInstruction({ lang: "es-419", native: "en", level: 2 }, [{ word: tomar, exposures: 0 }]);
    expect(text).toContain("tomar = to take, Spain: coger (vulgar in much of Latin America)");
    expect(loadWordlist("es").find((w) => w.target === "coger")?.baseNote).toBeUndefined(); // fine in Spain
  });
});
