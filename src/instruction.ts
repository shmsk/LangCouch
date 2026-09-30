import type { Config, Word } from "./types.ts";
import { glossFor, grammarStage, wordsPerResponse, INLINE_GLOSS_MAX_STEP, GLOSSARY_MAX_STEP } from "./types.ts";
import type { Pick } from "./scheduler.ts";
import type { GrammarItem } from "./grammar.ts";
import type { PatternCue } from "./patterns.ts";

const LANG_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

/** Where a base language's spelling is the norm, for the variant contrast ("Spain: coche"). */
const BASE_REGION: Record<string, string> = { es: "Spain", pt: "Portugal", en: "US" };

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
 *
 * Algorithm 1 asks for every listed word. Algorithm 2 asks for a word only where
 * the reply already needs its meaning: the 2026-09-30 eval (evals/results/) showed
 * that asking for all of them makes every model invent sentences to host words.
 * Algorithm 3 is algorithm 2 plus a nudge (1-2 long-overdue words allowed as an
 * aside or a closing line) and translations that fade with the ladder step:
 * inline, then only in a closing glossary line, then none (`known`).
 */
export type WeaveAlgorithm = 1 | 2 | 3;

export const INSTRUCTION_BUDGET = 2400;

export function buildInstruction(config: Config, picks: Pick[], grammar: GrammarItem | null = null, rule: PatternCue | null = null, algorithm: WeaveAlgorithm = 1, known: Word[] = []): string {
  const name = langName(config.lang);
  const base = config.lang.split("-")[0]!;
  const region = BASE_REGION[base] ?? langName(base);
  const contrast = (target: string | undefined, note: string | undefined) =>
    target ? `, ${region}: ${target}${note ? ` (${note})` : ""}` : "";
  const item = (p: Pick) => `${p.word.target} = ${glossFor(p.word, config.native, config.lang)}${contrast(p.word.baseTarget, p.word.baseNote)}`;
  const vocab = picks.map(item).join("; ");
  const stage = grammarStage(config.level);
  const grammarContrast = grammar?.baseExample ? `; ${region}: ${grammar.baseExample}` : "";

  if (algorithm === 3) return ladderInstruction(config, picks, grammar, rule, known, item);

  const fitOnly = algorithm === 2;
  const lines = [
    `<langcouch>`,
    fitOnly
      ? `Passive language immersion (diglot weave). In the prose of your reply, replace up to ~${picks.length} common words with ${name} ones, using ONLY this list:`
      : `Passive language immersion (diglot weave). In the prose of your reply, naturally replace ~${picks.length} common words with ${name} ones, using ONLY this list:`,
    vocab,
    ...(fitOnly
      ? [`Use a word only where your reply already needs that meaning; skip the rest. A few words, or none, is fine. Never write a sentence, metaphor or example just to host a word.`]
      : []),
    `Format: **word** (translation) on first appearance in the reply, then just **word**.`,
    `Inflect the words to fit the context (plural, gender: casas, bonitas) — the lemma must stay recognizable.`,
  ];

  if (stage >= 2 && grammar) {
    // data-driven construction (grammar/<lang>.json) takes the place of the generic collocation line
    lines.push(
      `${fitOnly ? "Where it fits, apply" : "Additionally, apply"} the construction "${grammar.pattern}" 1-2 times with words from the list — e.g. ${grammar.exampleTarget} (${grammar.exampleGloss}${grammarContrast}), translation in parentheses.`,
    );
  } else if (stage >= 2) {
    lines.push(`${fitOnly ? "Where they fit," : "Additionally,"} 1-2 times use short collocations built from these same words (adj+noun, verb+object), with translations in parentheses.`);
  }
  if (stage >= 3) {
    const withConstruction = grammar ? ", using the construction above in it" : "";
    lines.push(`${fitOnly ? "If it fits the reply, once" : "Once,"} insert a whole simple sentence in the language (5-8 words from the list plus basic vocabulary)${withConstruction}, immediately followed by its translation in parentheses.`);
  }

  if (rule) {
    const notThese = rule.notThese.length > 0 ? ` False friends, not this rule: ${rule.notThese.join("; ")}.` : "";
    const avoid = rule.avoid.length > 0 ? ` Never use: ${rule.avoid.join(", ")}.` : "";
    lines.push(
      `Word-building rule: ${rule.from} → ${rule.to} (e.g. ${rule.example}). ${fitOnly ? "If your reply needs a word built by this rule, use one" : "Once, use one common word built by this rule"}, even if it is not on the list, translation in parentheses — only when its meaning matches exactly.${notThese}${avoid}`,
    );
  }

  lines.push(
    `Forbidden: touching code blocks, inline code, identifiers, commands, paths, URLs, quotes, or technical terms; translating the whole reply; weaving words not on the list${rule ? " (the one rule word aside)" : ""}.`,
    `Never weave into text the user will copy or send (a post, email, message, summary, document, commit message): keep it free of ${name} words and weave only in your own words around it.`,
    `The meaning and quality of the main reply always outweigh the weaving.`,
    `</langcouch>`,
  );

  return lines.join("\n");
}

/** Algorithm 3: fit words, a capped nudge, and translations that fade with the ladder step. */
function ladderInstruction(config: Config, picks: Pick[], grammar: GrammarItem | null, rule: PatternCue | null, known: Word[], item: (p: Pick) => string): string {
  const name = langName(config.lang);
  const native = langName(config.native.split("-")[0]!);
  const base = config.lang.split("-")[0]!;
  const region = BASE_REGION[base] ?? langName(base);
  const nudge = picks.filter((p) => p.nudge);
  const rest = picks.filter((p) => !p.nudge);
  const fresh = rest.filter((p) => (p.step ?? 0) <= INLINE_GLOSS_MAX_STEP);
  const familiar = rest.filter((p) => (p.step ?? 0) > INLINE_GLOSS_MAX_STEP && (p.step ?? 0) <= GLOSSARY_MAX_STEP);
  // an absorbed word that came due is reviewed like a known one: no translation
  const review = rest.filter((p) => (p.step ?? 0) > GLOSSARY_MAX_STEP).map((p) => p.word);
  const stage = grammarStage(config.level);
  const grammarContrast = grammar?.baseExample ? `; ${region}: ${grammar.baseExample}` : "";

  const head = [
    `<langcouch>`,
    `Language immersion (diglot weave): in your reply's prose, use up to ~${picks.length} ${name} words for common ones, ONLY from those below.`,
    ...(fresh.length ? [`New, translation inline: ${fresh.map(item).join("; ")}`] : []),
    ...(familiar.length ? [`Familiar, no translation in the text: ${familiar.map(item).join("; ")}`] : []),
  ];
  const knownAt = head.length; // the known line goes here, filled last to fit the budget
  const lines = [
    ...head,
    `Use a word only where your reply already needs that meaning; skip the rest. A few words, or none, is fine. Never write a sentence, metaphor or example just to host a word${nudge.length ? " (the nudge aside)" : ""}.`,
    ...(nudge.length
      ? [`Nudge, the one exception: work in ${nudge.map(item).join("; ")} even if unneeded, as a short aside or metaphor in your own words or one closing line after the answer; never in code, facts, numbers or names.`]
      : []),
    `Format: bold every woven word. New and nudge words: **word** (translation) the first time, then **word**; familiar and known: just **word**.`,
    ...(familiar.length ? [`If you used familiar words, close with one line of only those used: ${familiar[0] ? item(familiar[0]) : ""} · …; none used, no line.`] : []),
    `Inflect words to fit (casas, bonitas), keeping the lemma recognizable.`,
  ];

  if (stage >= 2 && grammar) {
    lines.push(`Where it fits, apply the construction "${grammar.pattern}" 1-2 times with words from the list — e.g. ${grammar.exampleTarget} (${grammar.exampleGloss}${grammarContrast}), translation in parentheses.`);
  } else if (stage >= 2) {
    lines.push(`Where they fit, 1-2 times use short collocations built from these same words (adj+noun, verb+object), with translations in parentheses.`);
  }
  if (stage >= 3) {
    const withConstruction = grammar ? ", using the construction above in it" : "";
    lines.push(`If it fits, once, in your own words and never in text the user will copy, insert a whole simple sentence in the language (5-8 listed or basic words)${withConstruction}, its translation right after in parentheses.`);
  }
  if (rule) {
    const notThese = rule.notThese.length > 0 ? ` False friends, not this rule: ${rule.notThese.join("; ")}.` : "";
    const avoid = rule.avoid.length > 0 ? ` Never use: ${rule.avoid.join(", ")}.` : "";
    lines.push(`Word-building rule: ${rule.from} → ${rule.to} (e.g. ${rule.example}). If the reply needs such a word, use one even if unlisted, translated in parentheses, only when the meaning matches exactly.${notThese}${avoid}`);
  }
  lines.push(
    `Never touch code, identifiers, commands, paths, URLs, quotes or technical terms; never translate the whole reply or weave unlisted words${rule ? " (the rule word aside)" : ""}.`,
    `Anything the user will copy or send (post, email, message, summary, document, commit message) is written entirely in ${native}, no ${name}: weave only in your text around it.`,
    `The meaning and quality of the main reply always outweigh the weaving.`,
    `</langcouch>`,
  );

  // known words fill whatever the budget leaves, least recently seen first
  const pool = [...review, ...known].map((w) => w.target);
  const label = `Known, no translation anywhere: `;
  let room = INSTRUCTION_BUDGET - lines.join("\n").length - label.length - 1;
  const fit: string[] = [];
  for (const t of pool) {
    const cost = t.length + (fit.length ? 2 : 0);
    if (cost > room) break;
    fit.push(t);
    room -= cost;
  }
  if (fit.length) lines.splice(knownAt, 0, label + fit.join(", "));
  return lines.join("\n");
}

export { wordsPerResponse };
