import type { Pos, State, Word } from "./types.ts";

/**
 * How numbers are built in a language: the numeral words (num-0 … num-1000) are ordinary
 * concepts on the ladder, and these rules show how any number up to 1000 is assembled from
 * them (English 11 and 12 to memorize, then <unit>+teen; French 70 = 60+10). Lives in
 * data/numbers/<lang>.json, in teaching order.
 */
export interface NumberRule {
  /** Stable within a language ("teens", "tens", "hundreds", "seventy") */
  id: string;
  /** The rule in the learner's language, by native-language code ({ en, ru, uz }) */
  hint: Record<string, string>;
  /** One number the rule builds */
  example: { value: number; target: string };
  /** Where it was checked */
  source: string;
}

/** Everything the instruction needs to teach one number rule this reply. */
export interface NumberCue {
  hint: string;
  /** "17 = diciassette" */
  example: string;
}

export const NUM_POS: Pos = "num";
export const numberKey = (id: string) => `n:${id}`;

/** A number rule counts as introduced once it has been taught this many times. */
export const NUMBER_RULE_INTRODUCED_AFTER = 3;

/** Numerals in one reply, at most: numbers never crowd out the words. */
export const MAX_NUMERALS = 1;

/** The number a numeral concept stands for (num-12 → 12); null for any other concept. */
export function numeralValue(id: string): number | null {
  const m = id.match(/^num-(\d+)$/);
  return m ? Number(m[1]) : null;
}

const shown = (r: NumberRule, state: State) => state[numberKey(r.id)]?.exposures ?? 0;

/**
 * The rule to teach this reply, only while some rule is not introduced yet: the first such
 * rule in teaching order. Null once all are, so the word-building rule gets its slot back.
 */
export function pickNumberRule(rules: NumberRule[], state: State): NumberRule | null {
  return rules.find((r) => shown(r, state) < NUMBER_RULE_INTRODUCED_AFTER) ?? null;
}

export function numberCue(r: NumberRule, native: string): NumberCue {
  return {
    hint: r.hint[native] ?? r.hint.en ?? Object.values(r.hint)[0] ?? "",
    example: `${r.example.value} = ${r.example.target}`,
  };
}

/** Track that a number rule went into an instruction. Mutates and returns state. */
export function markNumberRuleShown(state: State, r: NumberRule, now: string): State {
  const prev = state[numberKey(r.id)] ?? { exposures: 0, lastSeen: "" };
  state[numberKey(r.id)] = { exposures: prev.exposures + 1, lastSeen: now };
  return state;
}

export function numberRuleProgress(rules: NumberRule[], state: State): { total: number; introduced: number } {
  return { total: rules.length, introduced: rules.filter((r) => shown(r, state) >= NUMBER_RULE_INTRODUCED_AFTER).length };
}

/** The numeral among the picks, if any (there is at most one, see MAX_NUMERALS). */
export function pickedNumeral(words: Word[]): Word | null {
  return words.find((w) => w.pos === NUM_POS) ?? null;
}
