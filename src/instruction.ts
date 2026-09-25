import type { Config } from "./types.ts";
import { glossFor, grammarStage, wordsPerResponse } from "./types.ts";
import type { Pick } from "./scheduler.ts";
import type { GrammarItem } from "./grammar.ts";

const LANG_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

/** English name of a language code (tr → Turkish); unknown codes come back as-is. */
export function langName(code: string): string {
  try {
    return LANG_NAMES.of(code) ?? code;
  } catch {
    return code; // malformed code — Intl throws RangeError
  }
}

/**
 * Build the weave instruction injected into the agent's context.
 * English-only surface (user rule: no Russian in instructions); glosses come from
 * the concept gloss record, keyed by config.native (en fallback).
 * Hard budget: ≤2400 chars (~600 tokens) — verified by test.
 */
export function buildInstruction(config: Config, picks: Pick[], grammar: GrammarItem | null = null): string {
  const name = langName(config.lang);
  const vocab = picks.map((p) => `${p.word.target} = ${glossFor(p.word, config.native)}`).join("; ");
  const stage = grammarStage(config.level);

  const lines = [
    `<langcouch>`,
    `Passive language immersion (diglot weave). In the prose of your reply, naturally replace ~${picks.length} common words with ${name} ones, using ONLY this list:`,
    vocab,
    `Format: **word** (translation) on first appearance in the reply, then just **word**.`,
    `Inflect the words to fit the context (plural, gender: casas, bonitas) — the lemma must stay recognizable.`,
  ];

  if (stage >= 2 && grammar) {
    // data-driven construction (grammar/<lang>.json) replaces the hardcoded stage lines
    lines.push(
      `Additionally, apply the construction "${grammar.pattern}" 1-2 times with words from the list — e.g. ${grammar.exampleTarget} (${grammar.exampleGloss}), translation in parentheses.`,
    );
  } else {
    if (stage >= 2) {
      lines.push(`Additionally, 1-2 times use short collocations built from these same words (adj+noun, verb+object), with translations in parentheses.`);
    }
    if (stage >= 3) {
      lines.push(`Once, insert a whole simple sentence in the language (5-8 words from the list plus basic vocabulary), immediately followed by its translation in parentheses.`);
    }
  }

  lines.push(
    `Forbidden: touching code blocks, inline code, identifiers, commands, paths, URLs, quotes, or technical terms; translating the whole reply; weaving words not on the list.`,
    `The meaning and quality of the main reply always outweigh the weaving.`,
    `</langcouch>`,
  );

  return lines.join("\n");
}

export { wordsPerResponse };
