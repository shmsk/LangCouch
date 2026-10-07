import { meansFor, type FalseFriend, type State } from "./types.ts";

/**
 * A word-building rule: one native suffix maps to one target suffix, so a learner who
 * knows it recognises a whole family of words at once (-ция → -ción: revolución,
 * información, nación…). Lives in data/patterns/<lang>.json, in teaching order.
 */
export interface Pattern {
  /** Stable across languages ("tion", "ity", "irovat") */
  id: string;
  /** Native-side suffix by native-language code; a missing code means the rule has no parallel there */
  from: Record<string, string>;
  /** Target-side suffix ("-ción") */
  to: string;
  examples: { target: string; gloss: Record<string, string> }[];
  /** Where the correspondence was checked */
  source: string;
}

/** Everything the instruction needs to teach one rule this reply. */
export interface PatternCue {
  from: string;
  to: string;
  /** "revolución = революция" */
  example: string;
  /** Neutral false friends posing as this rule: "actual = current" */
  notThese: string[];
  /** Words rude in the learner's variant; never to be used */
  avoid: string[];
}

export const patternKey = (id: string) => `p:${id}`;

/** A rule counts as introduced once it has been taught this many times. */
export const INTRODUCED_AFTER = 3;

/** Rules are the easiest step up from single words, so they start early. */
export const PATTERN_MIN_LEVEL = 2;

/** The suffix the learner knows: their native one, else English; null when the rule has no parallel for them. */
export function fromFor(p: Pattern, native: string): string | null {
  return p.from[native] ?? p.from.en ?? null;
}

const shown = (p: Pattern, state: State) => state[patternKey(p.id)]?.exposures ?? 0;

/**
 * The rule to teach this reply: the first one in teaching order that is not introduced
 * yet; once all are, the least shown. Null when no rule applies to this native language.
 */
export function pickPattern(patterns: Pattern[], native: string, state: State): Pattern | null {
  const usable = patterns.filter((p) => fromFor(p, native) !== null);
  const fresh = usable.find((p) => shown(p, state) < INTRODUCED_AFTER);
  if (fresh) return fresh;
  return [...usable].sort((a, b) => shown(a, state) - shown(b, state))[0] ?? null;
}

export interface PatternProgress {
  total: number;
  introduced: number;
  /** the next rule to be introduced, or null when all are */
  next: { from: string; to: string } | null;
}

export function patternProgress(patterns: Pattern[], native: string, state: State): PatternProgress {
  const usable = patterns.filter((p) => fromFor(p, native) !== null);
  const introduced = usable.filter((p) => shown(p, state) >= INTRODUCED_AFTER).length;
  const next = usable.find((p) => shown(p, state) < INTRODUCED_AFTER);
  return { total: usable.length, introduced, next: next ? { from: fromFor(next, native)!, to: next.to } : null };
}

/**
 * Build the cue for a rule. `lang` is the learner's code (a variant sees its base's
 * false friends too); only vulgar entries marked for that exact code are avoided.
 */
export function patternCue(p: Pattern, native: string, lang: string, falseFriends: FalseFriend[]): PatternCue {
  const ex = p.examples[0];
  const gloss = ex ? (ex.gloss[native] ?? ex.gloss.en ?? Object.values(ex.gloss)[0] ?? "") : "";
  return {
    from: fromFor(p, native)!,
    to: p.to,
    example: ex ? `${ex.target} = ${gloss}` : "",
    notThese: falseFriends
      .filter((f) => f.register === "neutral" && f.pattern === p.id)
      .slice(0, 2)
      .map((f) => `${f.target} = ${meansFor(f, native, lang)}`),
    avoid: falseFriends.filter((f) => f.register === "vulgar" && f.vulgarIn?.includes(lang)).map((f) => f.target),
  };
}

/** Track that a rule went into an instruction. Mutates and returns state. */
export function markPatternShown(state: State, p: Pattern, now: string): State {
  const prev = state[patternKey(p.id)] ?? { exposures: 0, lastSeen: "" };
  state[patternKey(p.id)] = { exposures: prev.exposures + 1, lastSeen: now };
  return state;
}
