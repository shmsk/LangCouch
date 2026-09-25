import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

// DATA_DIR is resolved at module load and the module is shared across test files, so
// set a sandbox before importing, then use whatever sandbox the store actually got.
process.env.LANGCOUCH_DIR ??= mkdtempSync(join(tmpdir(), "langcouch-user-"));
const { DATA_DIR: dir, availableLangs, userLangs, loadWordlist, loadGrammar, wordlistPath, WORDLISTS_DIR } = await import("../src/store.ts");
if (dir === join(homedir(), ".langcouch")) throw new Error("refusing to run against the real ~/.langcouch");

const userWordlists = join(dir, "wordlists");
const userGrammar = join(dir, "grammar");
const bundledTr = JSON.parse(readFileSync(join(WORDLISTS_DIR, "tr.json"), "utf8")) as Record<string, string>;

function reset() {
  rmSync(userWordlists, { recursive: true, force: true });
  rmSync(userGrammar, { recursive: true, force: true });
}

describe("user-added languages in ~/.langcouch", () => {
  test("without a user dir, only bundled languages are listed", () => {
    reset();
    expect(availableLangs()).toEqual(["es", "pt", "tr"]);
    expect(userLangs()).toEqual([]);
  });

  test("a user wordlist is listed and loads like a bundled one", () => {
    reset();
    mkdirSync(userWordlists, { recursive: true });
    writeFileSync(join(userWordlists, "ka.json"), JSON.stringify({ ...bundledTr, house: "სახლი" }));
    expect(availableLangs()).toEqual(["es", "ka", "pt", "tr"]);
    expect(userLangs()).toEqual(["ka"]);
    expect(loadWordlist("ka").find((w) => w.id === "house")?.target).toBe("სახლი");
  });

  test("a user file overrides the bundled one with the same code", () => {
    reset();
    mkdirSync(userWordlists, { recursive: true });
    writeFileSync(join(userWordlists, "es.json"), JSON.stringify({ house: "hogar" }));
    expect(wordlistPath("es")).toBe(join(userWordlists, "es.json"));
    expect(loadWordlist("es").find((w) => w.id === "house")?.target).toBe("hogar");
    expect(availableLangs().filter((l) => l === "es")).toHaveLength(1);
  });

  test("a user grammar file is picked up", () => {
    reset();
    mkdirSync(userGrammar, { recursive: true });
    const item = { id: "g1", pattern: "p", exampleTarget: "t", exampleGloss: "g", unlock: { pos: "noun" as const, absorbedCount: 1 } };
    writeFileSync(join(userGrammar, "ka.json"), JSON.stringify([item]));
    expect(loadGrammar("ka")).toEqual([item]);
    expect(loadGrammar("pt")).toEqual([]); // still no grammar anywhere for pt
  });
});
