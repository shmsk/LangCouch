#!/usr/bin/env bun
// Data validator. Exits 1 with a report if broken.
// Validates concepts.json plus every wordlist mapping (or one: bun tests/validate-wordlist.ts [path|lang]).
// --full: missing concepts are errors, not info — required for new-language contributions (docs/AddLanguage.md).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { runValidation } from "../src/validate.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const WORDLISTS_DIR = join(ROOT, "wordlists");
const CONCEPTS_PATH = join(ROOT, "concepts.json");

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const requireFull = flags.includes("--full");
const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const paths = arg
  ? [arg.endsWith(".json") ? arg : join(WORDLISTS_DIR, `${arg}.json`)]
  : readdirSync(WORDLISTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => join(WORDLISTS_DIR, f));

process.exit(runValidation(CONCEPTS_PATH, paths, requireFull) ? 0 : 1);
