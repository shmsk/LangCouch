import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, chmodSync, lstatSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { mergeStates } from "../src/transfer.ts";
import { stepOf } from "../src/ladder.ts";
import type { State, WordState } from "../src/types.ts";

// Two machines are two LANGCOUCH_DIRs; every step goes through the real CLI.
const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const machine = () => mkdtempSync(join(tmpdir(), "langcouch-transfer-"));
const run = (dir: string, args: string[]) =>
  spawnSync("bun", [CLI, ...args], { env: { ...process.env, LANGCOUCH_DIR: dir }, encoding: "utf8" });
const put = (dir: string, file: string, data: unknown) => {
  mkdirSync(join(dir, file, ".."), { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(data, null, 2));
};
const read = (dir: string, file: string) => JSON.parse(readFileSync(join(dir, file), "utf8"));
/** Everything in a data dir except backups, as one comparable value. */
const snapshot = (dir: string) =>
  Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => [f, readFileSync(join(dir, f), "utf8")]));

const T1 = "2026-09-01T10:00:00.000Z";
const T2 = "2026-09-20T10:00:00.000Z";
const CONFIG_A = { lang: "es", native: "ru", level: 4, algorithm: 3 };
const CONFIG_B = { lang: "es", native: "en", level: 2 };

/** Machine A: Claude Code, months of Spanish. */
function machineA() {
  const dir = machine();
  put(dir, "config.json", CONFIG_A);
  put(dir, "state.es.json", {
    house: { exposures: 12, lastSeen: T1, recalls: 3, step: 4, due: "2026-09-05T10:00:00.000Z" },
    big: { exposures: 2, lastSeen: T1 },
    "g:ser-estar": { exposures: 5, lastSeen: T1 },
  });
  put(dir, "state.pt.json", { house: { exposures: 1, lastSeen: T1 } });
  put(dir, "wordlists/xx.json", { house: "hus" });
  return dir;
}

function exportFrom(dir: string): string {
  const file = join(dir, "..", `${dir.split("/").pop()}-bundle.json`);
  const r = run(dir, ["export", file, "--force"]);
  expect(r.status).toBe(0);
  return file;
}

describe("export / import", () => {
  test("merges over progress already started in the same language", () => {
    const a = machineA();
    const b = machine(); // Hermes, started Spanish on its own
    put(b, "config.json", CONFIG_B);
    put(b, "state.es.json", {
      house: { exposures: 4, lastSeen: T2, recalls: 1, step: 2, due: "2026-09-21T10:00:00.000Z" },
      big: { exposures: 9, lastSeen: T2, recalls: 2 },
      dog: { exposures: 3, lastSeen: T2 },
    });
    const r = run(b, ["import", exportFrom(a)]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("es: words 0 new, 1 moved up; grammar and rules 1 updated");
    const es = read(b, "state.es.json");
    // only in B: untouched
    expect(es.dog).toEqual({ exposures: 3, lastSeen: T2 });
    // only in A: added
    expect(es["g:ser-estar"]).toEqual({ exposures: 5, lastSeen: T1 });
    // in both: the best of each field, ladder from the higher step
    expect(es.house).toEqual({ exposures: 12, lastSeen: T2, recalls: 3, step: 4, due: "2026-09-05T10:00:00.000Z" });
    expect(es.big).toEqual({ exposures: 9, lastSeen: T2, recalls: 2 });
    // a language B never had arrives whole
    expect(read(b, "state.pt.json")).toEqual({ house: { exposures: 1, lastSeen: T1 } });
    // B's own settings stay
    expect(read(b, "config.json")).toEqual(CONFIG_B);
    expect(read(b, "wordlists/xx.json")).toEqual({ house: "hus" });
  });

  test("a fresh machine ends up with the same data", () => {
    const a = machineA();
    const b = machine();
    expect(run(b, ["import", exportFrom(a)]).status).toBe(0);
    expect(snapshot(b)).toEqual(snapshot(a));
    expect(read(b, "wordlists/xx.json")).toEqual({ house: "hus" });
    expect(run(b, ["status"]).status).toBe(0);
  });

  test("importing twice, or sending it back, changes nothing", () => {
    const a = machineA();
    const b = machine();
    put(b, "state.es.json", { dog: { exposures: 3, lastSeen: T2 } });
    const bundle = exportFrom(a);
    run(b, ["import", bundle]);
    const once = snapshot(b);
    const again = run(b, ["import", bundle]);
    expect(again.stdout).toContain("nothing new");
    expect(snapshot(b)).toEqual(once);
    expect(readdirSync(join(b, "backups")).length).toBe(1); // no backup when nothing changes

    // B → A: A gains dog, nothing of A's moves
    const aBefore = read(a, "state.es.json");
    expect(run(a, ["import", exportFrom(b)]).status).toBe(0);
    const aAfter = read(a, "state.es.json");
    expect(aAfter.dog).toEqual({ exposures: 3, lastSeen: T2 });
    for (const [k, v] of Object.entries(aBefore)) expect(aAfter[k]).toEqual(v);
    // and back again: both machines now agree and further trips are no-ops
    const bBefore = snapshot(b);
    expect(run(b, ["import", exportFrom(a)]).stdout).toContain("nothing new");
    expect(snapshot(b)).toEqual(bBefore);
  });

  test("backs up the previous data before changing it", () => {
    const a = machineA();
    const b = machine();
    put(b, "config.json", CONFIG_B);
    put(b, "state.es.json", { dog: { exposures: 3, lastSeen: T2 } });
    run(b, ["import", exportFrom(a)]);
    const [backup] = readdirSync(join(b, "backups"));
    expect(read(join(b, "backups", backup!), "state.es.json")).toEqual({ dog: { exposures: 3, lastSeen: T2 } });
    expect(read(join(b, "backups", backup!), "config.json")).toEqual(CONFIG_B);
  });

  test("--config takes the exported settings; a differing user file is kept and reported", () => {
    const a = machineA();
    const b = machine();
    put(b, "config.json", CONFIG_B);
    put(b, "wordlists/xx.json", { house: "mine" });
    const r = run(b, ["import", exportFrom(a), "--config"]);
    expect(r.stdout).toContain("settings: taken from the export");
    expect(r.stdout).toContain("kept your wordlists/xx.json");
    expect(read(b, "config.json")).toEqual(CONFIG_A);
    expect(read(b, "wordlists/xx.json")).toEqual({ house: "mine" });
  });

  test("export to stdout and a ~ path", () => {
    const a = machineA();
    const out = run(a, ["export", "-"]);
    expect(JSON.parse(out.stdout).format).toBe("langcouch-export");
    const home = machine();
    const r = spawnSync("bun", [CLI, "export", "~/b.json"], { env: { ...process.env, LANGCOUCH_DIR: a, HOME: home }, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(existsSync(join(home, "b.json"))).toBe(true);
  });

  const bad: [string, (b: Record<string, unknown>) => unknown][] = [
    ["not JSON", () => "{oops"],
    ["a foreign file", () => ({ hello: 1 })],
    ["a newer format", (b) => ({ ...b, formatVersion: 99 })],
    ["a malformed record", (b) => ({ ...b, states: { es: { house: { exposures: "lots" } } } })],
    ["a language code that leaves the folder", (b) => ({ ...b, states: { "../../evil": {} } })],
    ["a user file name that leaves the folder", (b) => ({ ...b, user: { wordlists: { "../config": {} } } })],
    ["a broken config", (b) => ({ ...b, config: { lang: "es", native: "en", level: 99 } })],
    ["a config language that is a path", (b) => ({ ...b, config: { lang: "/../../victim/es", native: "en", level: 1 } })],
    ["a fractional level", (b) => ({ ...b, config: { lang: "es", native: "en", level: 2.5 } })],
    ["an unknown algorithm", (b) => ({ ...b, config: { lang: "es", native: "en", level: 2, algorithm: 9 } })],
    ["a fractional ladder step", (b) => ({ ...b, states: { es: { house: { exposures: 1, lastSeen: T1, step: 2.5 } } } })],
    ["a due date that is not a date", (b) => ({ ...b, states: { es: { house: { exposures: 1, lastSeen: T1, due: "zzz" } } } })],
    ["a lastSeen that is not a date", (b) => ({ ...b, states: { es: { house: { exposures: 1, lastSeen: "zzz" } } } })],
    ["a __proto__ key", (b) => ({ ...b, states: JSON.parse('{"es":{"__proto__":{"exposures":1,"lastSeen":"2026-09-01T10:00:00.000Z"}}}') })],
    ["a zero formatVersion", (b) => ({ ...b, formatVersion: 0 })],
    ["a grammar file that is not a list", (b) => ({ ...b, user: { grammar: { es: 42 } } })],
    ["a wordlist with unknown concepts", (b) => ({ ...b, user: { wordlists: { xx: { "no-such-concept": "x" } } } })],
  ];
  for (const [name, mutate] of bad) {
    test(`refuses ${name} and writes nothing`, () => {
      const b = machine();
      put(b, "config.json", CONFIG_B);
      put(b, "state.es.json", { dog: { exposures: 3, lastSeen: T2 } });
      const good = JSON.parse(readFileSync(exportFrom(machineA()), "utf8"));
      const m = mutate(good);
      const file = join(b, "..", `${b.split("/").pop()}-bad.json`);
      writeFileSync(file, typeof m === "string" ? m : JSON.stringify(m));
      const before = snapshot(b);
      const r = run(b, ["import", file]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("nothing was imported");
      expect(snapshot(b)).toEqual(before);
      expect(existsSync(join(b, "backups"))).toBe(false);
    });
  }
});

describe("import edge cases", () => {
  test("--config refuses a language this install does not have", () => {
    const a = machine();
    put(a, "config.json", { lang: "qq", native: "en", level: 2 });
    put(a, "state.es.json", { house: { exposures: 1, lastSeen: T1 } });
    const b = machine();
    put(b, "config.json", CONFIG_B);
    const before = snapshot(b);
    const r = run(b, ["import", exportFrom(a), "--config"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("does not have");
    expect(snapshot(b)).toEqual(before);
  });

  test("shared keys of a variant land in the base file", () => {
    const a = machine();
    put(a, "state.es-419.json", { house: { exposures: 20, lastSeen: T1, recalls: 5, step: 5, due: T2 } });
    const b = machine();
    put(b, "state.es.json", { house: { exposures: 1, lastSeen: T2, step: 0, due: T2 } });
    expect(run(b, ["import", exportFrom(a)]).status).toBe(0);
    expect(read(b, "state.es.json").house.step).toBe(5);
    expect(existsSync(join(b, "state.es-419.json")) ? read(b, "state.es-419.json").house : undefined).toBeUndefined();
  });

  test("a stray file name is left out of the export, not a reason to refuse it", () => {
    const a = machineA();
    put(a, "patterns/es_backup.json", []);
    const file = exportFrom(a);
    expect(JSON.parse(readFileSync(file, "utf8")).user.patterns).toEqual({});
    const b = machine();
    expect(run(b, ["import", file]).status).toBe(0);
  });

  test("the same config in another key order is not 'taken'", () => {
    const a = machineA();
    const b = machine();
    put(b, "config.json", { algorithm: 3, level: 4, native: "ru", lang: "es" });
    put(b, "state.es.json", read(a, "state.es.json"));
    put(b, "state.pt.json", read(a, "state.pt.json"));
    put(b, "wordlists/xx.json", { house: "hus" });
    const r = run(b, ["import", exportFrom(a), "--config"]);
    expect(r.stdout).toContain("nothing new");
    expect(existsSync(join(b, "backups"))).toBe(false);
  });

  test("a new user wordlist that replaces a built-in one says so", () => {
    const a = machineA();
    put(a, "wordlists/es.json", { house: "casita" });
    const r = run(machine(), ["import", exportFrom(a)]);
    expect(r.stdout).toContain("replaces the built-in es wordlist");
  });

  test("export will not write into the data folder or over a file", () => {
    const a = machineA();
    const into = run(a, ["export", join(a, "state.es.json")]);
    expect(into.status).toBe(1);
    expect(read(a, "state.es.json").house.exposures).toBe(12);
    const file = exportFrom(a);
    expect(run(a, ["export", file]).status).toBe(1);
    expect(run(a, ["export", file, "--force"]).status).toBe(0);
  });

  test("a symlinked state file is written through the link, keeping its mode", () => {
    const a = machineA();
    const synced = join(machine(), "state.es.json");
    writeFileSync(synced, JSON.stringify({ dog: { exposures: 3, lastSeen: T2 } }));
    chmodSync(synced, 0o600);
    const link = join(a, "state.es.json");
    require("node:fs").rmSync(link);
    symlinkSync(synced, link);
    const b = machineA();
    expect(run(a, ["import", exportFrom(b)]).status).toBe(0);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(synced, "utf8")).house.exposures).toBe(12);
    expect(statSync(synced).mode & 0o777).toBe(0o600);
  });
});

describe("mergeStates", () => {
  test("an absorbed word from before the ladder beats a fresh step-0 record, both ways", () => {
    const old: State = { house: { exposures: 30, recalls: 5, lastSeen: "2026-09-01T00:00:00.000Z" } };
    const fresh: State = { house: { exposures: 1, lastSeen: "2026-09-30T00:00:00.000Z", step: 0, due: "2026-09-30T00:00:00.000Z" } };
    expect(stepOf(mergeStates(fresh, old).state.house)).toBe(5);
    const kept = mergeStates(old, fresh);
    expect(stepOf(kept.state.house)).toBe(5);
    expect(kept.state.house!.lastSeen).toBe("2026-09-30T00:00:00.000Z");
  });

  test("prototype names are ordinary keys", () => {
    const local: State = JSON.parse('{"constructor":{"exposures":1,"lastSeen":"2026-09-01T00:00:00.000Z"}}');
    const incoming: State = JSON.parse('{"toString":{"exposures":2,"lastSeen":"2026-09-01T00:00:00.000Z"},"constructor":{"exposures":1,"lastSeen":"2026-09-01T00:00:00.000Z"}}');
    const r = mergeStates(local, incoming);
    expect(r.added).toEqual(["toString"]);
    expect(r.advanced).toEqual([]);
    expect((r.state as Record<string, unknown>)["toString"]).toEqual({ exposures: 2, lastSeen: "2026-09-01T00:00:00.000Z" });
  });

  // deterministic pseudo-random, so a failure reproduces
  let seed = 7;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  const rec = (): WordState => {
    const r: WordState = { exposures: rnd(20), lastSeen: `2026-09-${String(1 + rnd(28)).padStart(2, "0")}T00:00:00.000Z` };
    if (rnd(2)) r.recalls = rnd(5);
    if (rnd(2)) {
      r.step = rnd(7);
      r.due = `2026-10-${String(1 + rnd(28)).padStart(2, "0")}T00:00:00.000Z`;
    }
    return r;
  };
  const state = (): State => {
    const s: State = {};
    for (const k of ["a", "b", "c", "d", "e", "g:x", "p:y"]) if (rnd(3)) s[k] = rec();
    return s;
  };

  test("every key ends at least as high as on either side, and merging is idempotent", () => {
    for (let i = 0; i < 500; i++) {
      const local = state();
      const incoming = state();
      const { state: merged } = mergeStates(local, incoming);
      for (const side of [local, incoming]) {
        for (const [k, v] of Object.entries(side)) {
          const m = merged[k]!;
          expect(m.exposures).toBeGreaterThanOrEqual(v.exposures);
          expect(m.recalls ?? 0).toBeGreaterThanOrEqual(v.recalls ?? 0);
          expect(stepOf(m)).toBeGreaterThanOrEqual(stepOf(v)); // the step the ladder will use
          expect(m.lastSeen >= v.lastSeen).toBe(true);
        }
      }
      const twice = mergeStates(merged, incoming);
      expect(twice.added.length + twice.advanced.length).toBe(0);
      const back = mergeStates(merged, local);
      expect(back.added.length + back.advanced.length).toBe(0);
    }
  });
});
