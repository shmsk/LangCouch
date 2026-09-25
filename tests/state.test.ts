import { describe, expect, test } from "bun:test";
import { writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR as dir, loadState, saveState } from "../src/store.ts"; // sandboxed by tests/setup.ts

const esPath = join(dir, "state.es.json");
const ptPath = join(dir, "state.pt.json");

const esSnapshot = {
  house: { exposures: 9, lastSeen: "2026-07-01T00:00:00Z" },
  table: { exposures: 3, lastSeen: "2026-07-02T00:00:00Z" },
  hour: { exposures: 1, lastSeen: "2026-07-03T00:00:00Z" },
};

function cleanup() {
  for (const p of [esPath, ptPath]) rmSync(p, { force: true });
}

describe("per-language state", () => {
  test("missing state file loads as empty", () => {
    cleanup();
    expect(loadState("es")).toEqual({});
  });

  test("word absorbed in es has 0 exposures in a fresh pt state", () => {
    cleanup();
    writeFileSync(esPath, JSON.stringify(esSnapshot));
    const pt = loadState("pt");
    expect(pt["house"]).toBeUndefined();
    expect(Object.keys(pt)).toHaveLength(0);
  });

  test("state is keyed per language file and round-trips", () => {
    cleanup();
    saveState("pt", { house: { exposures: 2, lastSeen: "2026-07-13T00:00:00Z" } });
    saveState("es", esSnapshot);
    expect(existsSync(ptPath)).toBe(true);
    expect(loadState("pt")["house"]?.exposures).toBe(2);
    expect(loadState("es")).toEqual(esSnapshot); // es untouched by pt writes
  });
});
