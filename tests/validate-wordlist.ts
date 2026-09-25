#!/usr/bin/env bun
// Data validator. Exits 1 with a report if broken.
// Validates concepts.json plus every wordlist mapping (or one: bun tests/validate-wordlist.ts [path|lang]).
// --full: missing concepts are errors, not info — required for new-language contributions (docs/AddLanguage.md).
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { runValidation } from "../src/validate.ts";
import { baseLang, normalizeLang } from "../src/store.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const WORDLISTS_DIR = join(ROOT, "wordlists");
const CONCEPTS_PATH = join(ROOT, "concepts.json");

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const requireFull = flags.includes("--full");
const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const paths = arg
  ? [arg.endsWith(".json") ? arg : join(WORDLISTS_DIR, `${normalizeLang(arg)}.json`)]
  : readdirSync(WORDLISTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => join(WORDLISTS_DIR, f));

// A regional variant (pt-BR.json) is a sparse overlay: validate it merged over the bundled base.
const targets = paths.map((path) => {
  const base = baseLang(normalizeLang(basename(path, ".json")));
  return base ? [join(WORDLISTS_DIR, `${base}.json`), path] : [path];
});

process.exit(runValidation(CONCEPTS_PATH, targets, requireFull) ? 0 : 1);
