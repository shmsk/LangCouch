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
  // en/ru are required above; any further native language (uz, …) is all-or-nothing,
  // so a half-filled gloss key can't ship with learners seeing English fallbacks.
  const keys = new Set(list.flatMap((c) => Object.keys(c.gloss ?? {})));
  for (const key of keys) {
    const without = list.filter((c) => !c.gloss?.[key]);
    if (without.length) errors.push(`gloss.${key} missing on ${without.length} concepts: ${without.slice(0, 10).map((c) => c.id).join(", ")}${without.length > 10 ? ", …" : ""}`);
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
 * Validate one language. For a variant the mechanical rules (coverage, shared words)
 * run on the merged result, so a variant word that clashes with base words is caught.
 */
export function validateMapping(
  target: ValidationTarget,
  concepts: Map<string, Concept>,
  requireFull: boolean,
): { count: number; overrides: number | null; missing: string[]; shared: string[]; errors: string[] } {
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

  const byLemma = new Map<string, string[]>();
  for (const [id, lemma] of entries) {
    if (!concepts.has(id)) errors.push(`"${id}": unknown concept (not in concepts.json)`);
    if (typeof lemma !== "string" || !lemma) errors.push(`"${id}": empty lemma`);
    else {
      if (lemma.split(" ").length > 3) errors.push(`"${id}" (${lemma}): longer than 3 tokens`);
      byLemma.set(lemma, [...(byLemma.get(lemma) ?? []), id]);
    }
  }
  // A language may use one word for two concepts when that is genuinely its everyday
  // word for both (es mañana = morning and tomorrow). Three or more is a lazy list, not a language.
  const shared = [...byLemma].filter(([, ids]) => ids.length > 1);
  for (const [lemma, ids] of shared) {
    if (ids.length > 2) errors.push(`"${lemma}" is used by ${ids.length} concepts (${ids.join(", ")}); at most 2 may share a word`);
  }
  return {
    count: entries.length,
    overrides: overlay ? Object.keys(overlay).length : null,
    missing,
    shared: shared.map(([lemma, ids]) => `${lemma} (${ids.join(", ")})`),
    errors: [...new Set(errors)],
  };
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
    const { count, overrides, missing, shared, errors } = validateMapping(target, concepts, requireFull);
    const variant = overrides === null ? "" : ` (variant: ${overrides} overrides over ${target[0]})`;
    if (errors.length) {
      failed = true;
      console.error(`${path}${variant} FAILED:\n` + errors.map((e) => `  - ${e}`).join("\n"));
    } else {
      console.log(`${path}${variant} OK: ${count} entries, all concepts known, coverage ${count}/${concepts.size}${missing.length ? "" : " (full)"}`);
      // not an error — listed so a reviewer can check each one is a real shared word
      if (shared.length) console.log(`  ${shared.length} shared words: ${shared.join("; ")}`);
    }
  }
  return !failed;
}
