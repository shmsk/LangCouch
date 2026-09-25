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

/**
 * A language to validate: its files base first. One path for a plain language;
 * two for a regional variant — the base, then the sparse overlay (`pt.json`, `pt-BR.json`).
 */
export type ValidationTarget = string[];

function readMapping(path: string): WordMapping {
  return JSON.parse(readFileSync(path, "utf8")) as WordMapping;
}

/** Overlay-only checks: it must stay a diff — known concepts, no copies of the base word. */
function validateOverlay(overlay: WordMapping, base: WordMapping, concepts: Map<string, Concept>): string[] {
  const errors: string[] = [];
  for (const [id, lemma] of Object.entries(overlay)) {
    if (!concepts.has(id)) errors.push(`"${id}": unknown concept (not in concepts.json)`);
    else if (base[id] === lemma) errors.push(`"${id}": "${lemma}" is the same as the base word — drop it from the variant file`);
  }
  return errors;
}

/**
 * Validate one language. For a variant the mechanical rules (coverage, duplicates,
 * id collisions) run on the merged result, so a variant word that clashes with a base word is caught.
 */
export function validateMapping(
  target: ValidationTarget,
  concepts: Map<string, Concept>,
  requireFull: boolean,
): { count: number; overrides: number | null; missing: string[]; errors: string[] } {
  const layers = target.map(readMapping);
  const mapping = Object.assign({}, ...layers) as WordMapping;
  const overlay = layers.length > 1 ? layers[layers.length - 1]! : null;
  const errors: string[] = overlay ? validateOverlay(overlay, layers[0]!, concepts) : [];
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
  return { count: entries.length, overrides: overlay ? Object.keys(overlay).length : null, missing, errors: [...new Set(errors)] };
}

/** Validate concepts plus each language, printing a report. Returns true when everything passed. */
export function runValidation(conceptsPath: string, targets: ValidationTarget[], requireFull: boolean): boolean {
  let failed = false;
  const { concepts, errors: conceptErrors } = validateConcepts(conceptsPath);
  if (conceptErrors.length) {
    failed = true;
    console.error(`${conceptsPath} FAILED:\n` + conceptErrors.map((e) => `  - ${e}`).join("\n"));
  } else {
    console.log(`${conceptsPath} OK: ${concepts.size} concepts, unique ids, all POS valid`);
  }

  for (const target of targets) {
    const path = target[target.length - 1]!;
    const { count, overrides, missing, errors } = validateMapping(target, concepts, requireFull);
    const variant = overrides === null ? "" : ` (variant: ${overrides} overrides over ${target[0]})`;
    if (errors.length) {
      failed = true;
      console.error(`${path}${variant} FAILED:\n` + errors.map((e) => `  - ${e}`).join("\n"));
    } else {
      console.log(`${path}${variant} OK: ${count} entries, no duplicates, all concepts known, coverage ${count}/${concepts.size}${missing.length ? "" : " (full)"}`);
    }
  }
  return !failed;
}
