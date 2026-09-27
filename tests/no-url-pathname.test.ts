import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// `new URL(import.meta.url).pathname` yields "/C:/Users/..." on Windows and keeps
// "%20" for spaces everywhere, so the plugin couldn't find its own wordlists.
// Paths from a file URL must go through fileURLToPath.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BAD = /import\.meta\.url\)?\)?\.pathname/;

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : tsFiles(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

describe("file URL → path", () => {
  test("no code turns import.meta.url into a path via .pathname", () => {
    const offenders = ["src", "adapters", "tests"]
      .flatMap((d) => tsFiles(join(ROOT, d)))
      .filter((f) => f !== fileURLToPath(import.meta.url))
      .filter((f) => BAD.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders, "use fileURLToPath(import.meta.url) from node:url").toEqual([]);
  });
});
