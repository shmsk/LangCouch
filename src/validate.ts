// Wordlist/concept validator, shared by tests/validate-wordlist.ts (repo/CI) and
// `langcouch validate` (plugin users checking a language they added locally).
import { readFileSync } from "node:fs";
import type { Concept, WordMapping } from "./types.ts";

const POS = new Set(["noun", "verb", "adj", "adv"]);

export function validateConcepts(conceptsPath: string): { concepts: Map<string, Concept>; errors: string[] } {
  const list = JSON.parse(readFileSync(conceptsPath, "utf8")) as Concept[];
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

export function validateMapping(
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
      // A lemma spelled like a DIFFERENT concept's id makes state files ambiguous to read
      // (is "son" the Turkish word or the concept?). Forbid it.
      if (concepts.has(lemma) && lemma !== id) errors.push(`"${id}": lemma "${lemma}" collides with another concept id`);
    }
  }
  return { count: entries.length, missing, errors };
}

/** Validate concepts plus each mapping, printing a report. Returns true when everything passed. */
export function runValidation(conceptsPath: string, paths: string[], requireFull: boolean): boolean {
  let failed = false;
  const { concepts, errors: conceptErrors } = validateConcepts(conceptsPath);
  if (conceptErrors.length) {
    failed = true;
    console.error(`${conceptsPath} FAILED:\n` + conceptErrors.map((e) => `  - ${e}`).join("\n"));
  } else {
    console.log(`${conceptsPath} OK: ${concepts.size} concepts, unique ids, all POS valid`);
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
  return !failed;
}
