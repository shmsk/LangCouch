import { isAbsorbed, isWordKey, type State } from "./types.ts";
import type { TopicProgress } from "./topics.ts";

/**
 * Milestones: quiet gamification. A round number of absorbed words, the whole core, half and
 * all of a topic, and a weekly tally each earn one closing line, written by the agent in the
 * language being learned. Never a streak, never a loss, at most one line a day.
 */

/** Absorbed words that earn a line; the whole core is its own milestone. */
export const WORD_MILESTONES = [50, 100, 200, 300, 400] as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What has been celebrated, per language; kept in config.json next to the other once-only marks. */
export interface MilestoneLog {
  /** Highest word milestone shown (0 = none yet). */
  words: number;
  /** The whole core was celebrated. */
  core?: boolean;
  /** Per topic slug: 50 or 100 once that share was celebrated. */
  topics: Record<string, number>;
  /** Start of the current week and the absorbed count then. */
  weekAt: string;
  weekBase: number;
  /** Local day (YYYY-MM-DD) of the last line: one a day. */
  lastDay?: string;
}

export type Cheer =
  | { kind: "words"; n: number }
  | { kind: "core"; total: number }
  | { kind: "topic"; slug: string; title: string; pct: 50 | 100; passed: number; total: number }
  | { kind: "week"; gained: number };

/** Words (and topic phrases) absorbed in one language's state. */
export const absorbedCount = (state: State): number =>
  Object.entries(state).filter(([k, s]) => isWordKey(k) && isAbsorbed(s)).length;

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const topicPct = (p: TopicProgress): 0 | 50 | 100 => (p.total > 0 && p.passed >= p.total ? 100 : p.passed * 2 >= p.total && p.total > 0 ? 50 : 0);
const crossed = (absorbed: number) => WORD_MILESTONES.filter((m) => m <= absorbed).at(-1) ?? 0;

/**
 * This turn's line, if any, and the log to save. The first call for a language only records
 * where the learner already is: an update never celebrates milestones left behind long ago.
 */
export function pickCheer(
  log: MilestoneLog | undefined,
  absorbed: number,
  core: { absorbed: number; total: number },
  topics: TopicProgress[],
  now: string,
): { cheer: Cheer | null; log: MilestoneLog } {
  const coreDone = core.total > 0 && core.absorbed >= core.total;
  if (!log) {
    const seeded: MilestoneLog = { words: crossed(absorbed), core: coreDone, topics: {}, weekAt: now, weekBase: absorbed };
    for (const t of topics) seeded.topics[t.slug] = topicPct(t);
    return { cheer: null, log: seeded };
  }
  const next: MilestoneLog = { ...log, topics: { ...log.topics } };
  // a topic seen for the first time starts where it is: one added half-known isn't "half done"
  for (const t of topics) if (!(t.slug in next.topics)) next.topics[t.slug] = topicPct(t);
  if (log.lastDay === localDay(now)) return { cheer: null, log: next };

  let cheer: Cheer | null = null;
  const words = crossed(absorbed);
  if (coreDone && !log.core) {
    cheer = { kind: "core", total: core.total };
    next.core = true;
    next.words = Math.max(next.words, words);
  } else if (words > log.words) {
    cheer = { kind: "words", n: words };
    next.words = words;
  } else {
    for (const t of topics) {
      const pct = topicPct(t);
      if (pct > (next.topics[t.slug] ?? 0)) {
        cheer = { kind: "topic", slug: t.slug, title: t.title, pct: pct as 50 | 100, passed: t.passed, total: t.total };
        next.topics[t.slug] = pct;
        break;
      }
    }
  }
  if (!cheer && Date.parse(now) - Date.parse(log.weekAt) >= WEEK_MS) {
    // a quiet week passes without a word: nothing is ever reported as lost
    const gained = absorbed - log.weekBase;
    if (gained > 0) cheer = { kind: "week", gained };
    next.weekAt = now;
    next.weekBase = absorbed;
  }
  if (cheer) next.lastDay = localDay(now);
  return { cheer, log: next };
}

/** The instruction line for the agent: facts in English, the line itself in the learned language. */
export function cheerLine(cheer: Cheer, lang: string): string {
  const fact =
    cheer.kind === "words" ? `the learner has just absorbed ${cheer.n} ${lang} words`
    : cheer.kind === "core" ? `the learner has absorbed all ${cheer.total} core ${lang} words`
    : cheer.kind === "week" ? `this week the learner absorbed ${cheer.gained} new ${lang} words`
    : cheer.pct === 100 ? `the learner has passed every entry of the topic "${cheer.title}" (${cheer.total})`
    : `the learner is half way through the topic "${cheer.title}" (${cheer.passed}/${cheer.total})`;
  return `Milestone: ${fact}. End the reply with one short 🎉 line in ${lang} about it, with the number: simple words, a translation in parentheses after any they may not know.`;
}

/** The way to the next milestone: `▓▓▓▓░ 87/100`; null once the core is done and no milestone is left. */
export function milestoneBar(absorbed: number, coreTotal: number): string | null {
  const goals = [...WORD_MILESTONES.filter((m) => m < coreTotal), ...(coreTotal > 0 ? [coreTotal] : [])];
  const goal = goals.find((m) => m > absorbed);
  if (goal === undefined) return null;
  const from = goals.filter((m) => m <= absorbed).at(-1) ?? 0;
  const filled = Math.min(4, Math.floor(((absorbed - from) / (goal - from)) * 5));
  return `${"▓".repeat(filled)}${"░".repeat(5 - filled)} ${absorbed}/${goal}`;
}
