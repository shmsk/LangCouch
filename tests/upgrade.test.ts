import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// Data written by released versions must keep working after an update. Each folder in
// tests/fixtures/<version>/ is a ~/.langcouch as that version left it. Add one when a
// release changes what goes on disk; never edit an old one.
const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const FIXTURES = join(import.meta.dir, "fixtures");
type State = Record<string, { exposures: number; recalls?: number }>;

describe.each(readdirSync(FIXTURES))("data from %s", (version) => {
  function copy() {
    const dir = mkdtempSync(join(tmpdir(), `langcouch-upgrade-${version}-`));
    cpSync(join(FIXTURES, version), dir, { recursive: true });
    return dir;
  }
  const run = (dir: string, args: string[], input = "") =>
    spawnSync("bun", [CLI, ...args], { env: { ...process.env, LANGCOUCH_DIR: dir }, input, encoding: "utf8" });
  const states = (dir: string) =>
    Object.fromEntries(readdirSync(dir).filter((f) => f.startsWith("state.")).map((f) => [f, JSON.parse(readFileSync(join(dir, f), "utf8")) as State]));
  // best known progress per key across all state files: nothing may go below it
  const best = (all: Record<string, State>) => {
    const out: Record<string, { exposures: number; recalls: number }> = {};
    for (const s of Object.values(all))
      for (const [k, v] of Object.entries(s)) {
        const o = out[k] ?? { exposures: 0, recalls: 0 };
        out[k] = { exposures: Math.max(o.exposures, v.exposures), recalls: Math.max(o.recalls, v.recalls ?? 0) };
      }
    return out;
  };

  test("status and the hook work on it", () => {
    const dir = copy();
    const status = run(dir, ["status"]);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("Core (tier 1)");
    const hook = run(dir, ["hook"], JSON.stringify({ prompt: "upgrade check" }));
    expect(hook.status).toBe(0);
    expect(hook.stdout).toContain("<langcouch>");
  });

  test("switching to algorithm 3 keeps every absorbed word absorbed", () => {
    const dir = copy();
    const cfgPath = join(dir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(readFileSync(cfgPath, "utf8")), algorithm: 3 }));
    const absorbed = () => Number(run(dir, ["status"]).stdout.match(/Absorbed \(recall formula\): (\d+)/)?.[1]);
    const before = absorbed();
    const bestBefore = best(states(dir));
    const hook = run(dir, ["hook"], JSON.stringify({ prompt: "upgrade check", session_id: "u", hook_event_name: "UserPromptSubmit" }));
    expect(hook.stdout).toContain("<langcouch>");
    expect(run(dir, ["hook"], JSON.stringify({ session_id: "u", hook_event_name: "Stop", last_assistant_message: "no weave" })).status).toBe(0);
    expect(absorbed()).toBeGreaterThanOrEqual(before);
    const after = best(states(dir));
    for (const [key, b] of Object.entries(bestBefore)) expect(after[key]?.exposures ?? 0).toBeGreaterThanOrEqual(b.exposures);
  });

  test("exports and imports onto a fresh machine without loss", () => {
    const dir = copy();
    const fresh = mkdtempSync(join(tmpdir(), `langcouch-upgrade-${version}-to-`));
    const bundle = join(fresh, "..", `${fresh.split("/").pop()}.json`);
    expect(run(dir, ["export", bundle]).status).toBe(0);
    expect(run(fresh, ["import", bundle]).status).toBe(0);
    const before = best(states(dir));
    const after = best(states(fresh));
    for (const [key, b] of Object.entries(before)) expect(after[key]).toEqual(b);
    expect(run(fresh, ["status"]).status).toBe(0);
  });

  test("no progress is lost after a few replies", () => {
    const dir = copy();
    const before = best(states(dir));
    for (let i = 0; i < 3; i++) run(dir, ["hook"], JSON.stringify({ prompt: `upgrade reply ${i}` }));
    const after = best(states(dir));
    for (const [key, b] of Object.entries(before)) {
      expect(after[key]?.exposures ?? 0).toBeGreaterThanOrEqual(b.exposures);
      expect(after[key]?.recalls ?? 0).toBeGreaterThanOrEqual(b.recalls);
    }
  });
});

// Export files made by released versions must keep importing. One file per format version
// in tests/export-fixtures/; never edit an old one.
const EXPORTS = join(import.meta.dir, "export-fixtures");

describe.each(readdirSync(EXPORTS))("export file %s", (file) => {
  test("imports on top of existing progress and keeps both", () => {
    const dir = mkdtempSync(join(tmpdir(), "langcouch-upgrade-export-"));
    writeFileSync(join(dir, "state.es.json"), JSON.stringify({ "zz-local-only": { exposures: 2, lastSeen: "2026-10-01T00:00:00.000Z" } }));
    const r = spawnSync("bun", [CLI, "import", join(EXPORTS, file)], { env: { ...process.env, LANGCOUCH_DIR: dir }, encoding: "utf8" });
    expect(r.status).toBe(0);
    const bundle = JSON.parse(readFileSync(join(EXPORTS, file), "utf8")) as { states: Record<string, State> };
    const es = JSON.parse(readFileSync(join(dir, "state.es.json"), "utf8")) as State;
    expect(es["zz-local-only"]?.exposures).toBe(2);
    for (const [key, v] of Object.entries(bundle.states.es ?? {})) expect(es[key]?.exposures).toBe(v.exposures);
  });
});
