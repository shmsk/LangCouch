import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DATA_DIR as dir, PLUGIN_VERSION, changelogFor } from "../src/store.ts"; // sandboxed by tests/setup.ts

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const root = join(import.meta.dir, "..");
const status = () => spawnSync("bun", [CLI, "status"], { env: { ...process.env, LAZY_POLYGLOT_DIR: dir }, encoding: "utf8" }).stdout;

describe("changelog", () => {
  test("every released version has a changelog section, and the manifests agree on it", () => {
    expect(changelogFor(PLUGIN_VERSION).length).toBeGreaterThan(0);
    for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
      expect(readFileSync(join(root, f), "utf8")).toContain(`"version": "${PLUGIN_VERSION}"`);
    }
  });

  test("entries come one per line, continuation joined, emphasis stripped", () => {
    const items = changelogFor("0.3.7");
    expect(items[0]).toStartWith("Switching to a regional variant");
    expect(items[0]).toContain("carro = car, Spain: coche");
    expect(items.every((i) => !i.includes("*"))).toBe(true);
    expect(changelogFor("9.9.9")).toEqual([]);
  });

  test("status shows what's new once after an update", () => {
    const configPath = join(dir, "config.json");
    const saved = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
    try {
      writeFileSync(configPath, JSON.stringify({ lang: "es", native: "en", level: 2, seenVersion: "0.0.1" }));
      const first = status();
      expect(first).toContain(`What's new in ${PLUGIN_VERSION}:`);
      // the newest section's first item, whatever the current version is
      expect(first).toContain(`  • ${changelogFor(PLUGIN_VERSION)[0]!.slice(0, 40)}`);
      expect(JSON.parse(readFileSync(configPath, "utf8")).seenVersion).toBe(PLUGIN_VERSION);
      expect(status()).not.toContain("What's new");
    } finally {
      if (saved === null) rmSync(configPath, { force: true });
      else writeFileSync(configPath, saved);
    }
  });
});

test("numbered Upgrade notes steps reach status too", () => {
  const dir = require("node:fs").mkdtempSync(join(require("node:os").tmpdir(), "lazy-polyglot-cl-"));
  const file = join(dir, "CHANGELOG.md");
  writeFileSync(file, "## [9.0.0] - 2030-01-01\n\n### Upgrade notes\n1. Run `lazy-polyglot init`.\n   Then check status.\n\n### Added\n- Thing.\n");
  expect(changelogFor("9.0.0", file)).toEqual(["1. Run `lazy-polyglot init`. Then check status.", "Thing."]);
});
