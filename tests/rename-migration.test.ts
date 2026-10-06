import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { copyMove, migrateLegacyDataDir } from "../src/migrate.ts";

// The plugin used to be LangCouch with data in ~/.langcouch. After the rename the first run moves it
// to ~/.lazy-polyglot without loss. Every test gets its own fake HOME; the real one is never touched.
const CLI = join(import.meta.dir, "..", "src", "cli.ts");

/** A ~/.langcouch laid out like a 0.9.5 install. */
const FILES: Record<string, string> = {
  "config.json": JSON.stringify({ lang: "es", native: "en", level: 3, algorithm: 3 }, null, 2),
  "state.it.json": JSON.stringify({ casa: { exposures: 4, lastSeen: "2026-10-01T00:00:00.000Z" } }, null, 2),
  "state.es.json": JSON.stringify({ hola: { exposures: 2, lastSeen: "2026-10-02T00:00:00.000Z" } }, null, 2),
  "served.json": JSON.stringify({}),
  "last-hook.json": JSON.stringify({ at: 1 }),
  "wordlists/xx.json": JSON.stringify({ hello: "xx-hello" }, null, 2),
};

function legacyHome(files = FILES) {
  const home = mkdtempSync(join(tmpdir(), "lazy-polyglot-rename-"));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(home, ".langcouch", rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return home;
}

/** Everything under `dir` as relative path -> content. */
function snapshot(dir: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const p = join(rel, e.name);
    if (e.isDirectory()) Object.assign(out, snapshot(dir, p));
    else out[p] = readFileSync(join(dir, p), "utf8");
  }
  return out;
}

/** The CLI as a user runs it: HOME only, no env var choosing the data dir. */
function run(home: string, args: string[], extraEnv: Record<string, string> = {}, input = "") {
  const env: Record<string, string | undefined> = { ...process.env, HOME: home, ...extraEnv };
  if (!("LAZY_POLYGLOT_DIR" in extraEnv)) delete env.LAZY_POLYGLOT_DIR;
  if (!("LANGCOUCH_DIR" in extraEnv)) delete env.LANGCOUCH_DIR;
  return spawnSync("bun", [CLI, ...args], { env, input, encoding: "utf8" });
}
const hook = (home: string, extraEnv: Record<string, string> = {}) =>
  run(home, ["hook"], extraEnv, JSON.stringify({ prompt: "rename check", session_id: "r", hook_event_name: "UserPromptSubmit" }));

describe("the rename moves ~/.langcouch to ~/.lazy-polyglot", () => {
  test("first hook run: everything arrives byte-identical, the old dir is gone, a second run changes nothing", () => {
    const home = legacyHome();
    const first = hook(home);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("<lazy-polyglot>");
    expect(existsSync(join(home, ".langcouch"))).toBe(false);
    const moved = snapshot(join(home, ".lazy-polyglot"));
    // the hook itself updates config, state.es.json, served.json and last-hook.json; the rest is untouched
    for (const rel of ["state.it.json", "wordlists/xx.json"]) expect(moved[rel]).toBe(FILES[rel]!);
    for (const rel of Object.keys(FILES)) expect(moved[rel]).toBeDefined();
    // a second run finds nothing to do: no old dir back, nothing changed
    const settled = snapshot(join(home, ".lazy-polyglot"));
    migrateLegacyDataDir(home, {});
    expect(existsSync(join(home, ".langcouch"))).toBe(false);
    expect(snapshot(join(home, ".lazy-polyglot"))).toEqual(settled);
  });

  test("the move alone is byte-identical for every file", () => {
    const home = legacyHome();
    migrateLegacyDataDir(home, {});
    expect(snapshot(join(home, ".lazy-polyglot"))).toEqual(FILES);
    expect(existsSync(join(home, ".langcouch"))).toBe(false);
    migrateLegacyDataDir(home, {});
    expect(snapshot(join(home, ".lazy-polyglot"))).toEqual(FILES);
  });

  test("a new dir that already exists is never overwritten, and the old one is not deleted", () => {
    const home = legacyHome();
    mkdirSync(join(home, ".lazy-polyglot"));
    writeFileSync(join(home, ".lazy-polyglot", "config.json"), '{"lang":"fr","native":"en","level":1}');
    const r = hook(home);
    expect(r.status).toBe(0);
    expect(snapshot(join(home, ".langcouch"))).toEqual(FILES);
    expect(JSON.parse(readFileSync(join(home, ".lazy-polyglot", "config.json"), "utf8")).lang).toBe("fr");
    expect(existsSync(join(home, ".lazy-polyglot", "state.it.json"))).toBe(false);
  });

  test.each(["LAZY_POLYGLOT_DIR", "LANGCOUCH_DIR"])("%s set: no migration", (name) => {
    const home = legacyHome();
    const chosen = mkdtempSync(join(tmpdir(), "lazy-polyglot-chosen-"));
    expect(run(home, ["init"], { [name]: chosen }).status).toBe(0);
    expect(snapshot(join(home, ".langcouch"))).toEqual(FILES);
    expect(existsSync(join(home, ".lazy-polyglot"))).toBe(false);
    expect(existsSync(join(chosen, "config.json"))).toBe(true);
  });

  test("the old LANGCOUCH_DIR name still picks the data dir", () => {
    const chosen = mkdtempSync(join(tmpdir(), "lazy-polyglot-old-env-"));
    writeFileSync(join(chosen, "config.json"), FILES["config.json"]!);
    const r = run(chosen, ["status"], { LANGCOUCH_DIR: chosen });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Data: ${chosen}`);
  });

  test("nothing to migrate: no old dir, nothing created by the migration", () => {
    const home = mkdtempSync(join(tmpdir(), "lazy-polyglot-rename-empty-"));
    migrateLegacyDataDir(home, {});
    expect(readdirSync(home)).toEqual([]);
  });

  test("the copy route (cross-device moves) keeps every file and removes the old dir", () => {
    const home = legacyHome();
    copyMove(join(home, ".langcouch"), join(home, ".lazy-polyglot"));
    expect(snapshot(join(home, ".lazy-polyglot"))).toEqual(FILES);
    expect(existsSync(join(home, ".langcouch"))).toBe(false);
    expect(readdirSync(home).sort()).toEqual([".lazy-polyglot"]);
  });

  test("the copy route leaves the old dir alone when the target appears meanwhile", () => {
    const home = legacyHome();
    mkdirSync(join(home, ".lazy-polyglot"));
    copyMove(join(home, ".langcouch"), join(home, ".lazy-polyglot"));
    expect(snapshot(join(home, ".langcouch"))).toEqual(FILES);
    expect(readdirSync(join(home, ".lazy-polyglot"))).toEqual([]);
    expect(readdirSync(home).sort()).toEqual([".langcouch", ".lazy-polyglot"]);
  });
});

describe("importing the library never moves user data", () => {
  test("a script that only imports src/store.ts (like the wordlist validator) leaves ~/.langcouch alone", () => {
    const home = legacyHome();
    const env: Record<string, string | undefined> = { ...process.env, HOME: home };
    delete env.LAZY_POLYGLOT_DIR;
    delete env.LANGCOUCH_DIR;
    const store = join(import.meta.dir, "..", "src", "store.ts");
    const r = spawnSync("bun", ["-e", `await import(${JSON.stringify(store)})`], { env, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(existsSync(join(home, ".langcouch", "state.it.json"))).toBe(true);
    expect(existsSync(join(home, ".lazy-polyglot"))).toBe(false);
  });
});
