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
  loadWordlist,
  normalizeLang,
  saveState,
  wordlistLayers,
  WORDLISTS_DIR,
  CONCEPTS_PATH,
} from "../src/store.ts";
import { validateConcepts, validateMapping } from "../src/validate.ts";
import { langName } from "../src/instruction.ts";

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

  test("grammar falls back to the base, a variant file overrides it", () => {
    reset();
    expect(loadGrammar("es-MX")).toEqual(loadGrammar("es"));
    const item = { id: "g1", pattern: "p", exampleTarget: "t", exampleGloss: "g", unlock: { pos: "noun" as const, absorbedCount: 1 } };
    mkdirSync(userGrammar, { recursive: true });
    writeFileSync(join(userGrammar, "es-MX.json"), JSON.stringify([item]));
    expect(loadGrammar("es-MX")).toEqual([item]);
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
