#!/usr/bin/env bun
// Data validator. Exits 1 with a report if broken.
// Validates concepts.json plus every wordlist mapping (or one: bun tests/validate-wordlist.ts [path|lang]).
// --full: missing concepts are errors, not info — required for new-language contributions (docs/AddLanguage.md).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Concept, WordMapping } from "../src/types.ts";

const POS = new Set(["noun", "verb", "adj", "adv"]);
const ROOT = new URL("..", import.meta.url).pathname;
const WORDLISTS_DIR = join(ROOT, "wordlists");
const CONCEPTS_PATH = join(ROOT, "concepts.json");

function validateConcepts(): { concepts: Map<string, Concept>; errors: string[] } {
  const list = JSON.parse(readFileSync(CONCEPTS_PATH, "utf8")) as Concept[];
  const errors: string[] = [];
  const concepts = new Map<string, Concept>();
  if (list.length < 300) errors.push(`only ${list.length} concepts, need ≥300`);
  for (const [i, c] of list.entries()) {
    if (!c.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) errors.push(`#${i}: bad id "${c.id}" (kebab-case slugs only)`);
    if (concepts.has(c.id)) errors.push(`#${i}: duplicate concept "${c.id}"`);
    if (!POS.has(c.pos)) errors.push(`#${i} (${c.id}): bad pos "${c.pos}"`);
    if (!Number.isInteger(c.tier) || c.tier < 1) errors.push(`#${i} (${c.id}): bad tier "${c.tier}"`);
    if (!c.gloss?.en) errors.push(`#${i} (${c.id}): missing gloss.en`);
    if (!c.gloss?.ru) errors.push(`#${i} (${c.id}): missing gloss.ru`);
    concepts.set(c.id, c);
  }
  return { concepts, errors };
}

function validateMapping(
  path: string,
  concepts: Map<string, Concept>,
  requireFull: boolean,
): { count: number; missing: string[]; errors: string[] } {
  const mapping = JSON.parse(readFileSync(path, "utf8")) as WordMapping;
  const errors: string[] = [];
  const entries = Object.entries(mapping);
  if (entries.length < 300) errors.push(`only ${entries.length} entries, need ≥300`);

  const missing = [...concepts.keys()].filter((id) => !(id in mapping));
  if (requireFull && missing.length) {
    errors.push(`missing ${missing.length} concepts: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ", …" : ""}`);
  }

  const seenLemmas = new Map<string, string>();
  for (const [id, lemma] of entries) {
    if (!concepts.has(id)) errors.push(`"${id}": unknown concept (not in concepts.json)`);
    if (typeof lemma !== "string" || !lemma) errors.push(`"${id}": empty lemma`);
    else {
      if (lemma.split(" ").length > 3) errors.push(`"${id}" (${lemma}): longer than 3 tokens`);
      const prior = seenLemmas.get(lemma);
      if (prior) errors.push(`"${id}": duplicate lemma "${lemma}" (also "${prior}")`);
      seenLemmas.set(lemma, id);
      // State migration renames lemma keys to concept ids; a lemma spelled like a
      // DIFFERENT concept's id would be mis-claimed as already-migrated. Forbid it.
      if (concepts.has(lemma) && lemma !== id) errors.push(`"${id}": lemma "${lemma}" collides with another concept id`);
    }
  }
  return { count: entries.length, missing, errors };
}

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const requireFull = flags.includes("--full");
const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const paths = arg
  ? [arg.endsWith(".json") ? arg : join(WORDLISTS_DIR, `${arg}.json`)]
  : readdirSync(WORDLISTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => join(WORDLISTS_DIR, f));

let failed = false;
const { concepts, errors: conceptErrors } = validateConcepts();
if (conceptErrors.length) {
  failed = true;
  console.error(`${CONCEPTS_PATH} FAILED:\n` + conceptErrors.map((e) => `  - ${e}`).join("\n"));
} else {
  console.log(`${CONCEPTS_PATH} OK: ${concepts.size} concepts, unique ids, all POS valid`);
}

for (const path of paths) {
  const { count, missing, errors } = validateMapping(path, concepts, requireFull);
  if (errors.length) {
    failed = true;
    console.error(`${path} FAILED:\n` + errors.map((e) => `  - ${e}`).join("\n"));
  } else {
    console.log(`${path} OK: ${count} entries, no duplicates, all concepts known, coverage ${count}/${concepts.size}${missing.length ? "" : " (full)"}`);
  }
}
process.exit(failed ? 1 : 0);
