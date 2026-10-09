import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { cheerLine, milestoneBar, pickCheer, type MilestoneLog } from "../src/milestones.ts";
import { loadWordlist } from "../src/store.ts";
import type { TopicProgress } from "../src/topics.ts";
import { ABSORBED_STEP, type State } from "../src/types.ts";

const DAY1 = "2026-10-09T10:00:00.000Z";
const LATER_SAME_DAY = "2026-10-09T11:00:00.000Z";
const DAY2 = "2026-10-10T10:00:00.000Z";
const WEEK_ON = "2026-10-16T10:00:00.000Z";
const CORE = { absorbed: 0, total: 453 };
const log = (over: Partial<MilestoneLog> = {}): MilestoneLog => ({ words: 50, topics: {}, weekAt: DAY1, weekBase: 60, ...over });
const topic = (passed: number, total = 10, slug = "bcn"): TopicProgress => ({ slug, title: "Barcelona", total, passed, words: passed, phrases: 0, daysLeft: null });

describe("pickCheer", () => {
  test("first run seeds silently: an upgrade never celebrates milestones left behind", () => {
    const { cheer, log: seeded } = pickCheer(undefined, 230, { absorbed: 230, total: 453 }, [topic(6)], DAY1);
    expect(cheer).toBeNull();
    expect(seeded).toMatchObject({ words: 200, core: false, topics: { bcn: 50 }, weekAt: DAY1, weekBase: 230 });
  });

  test("crossing 100 fires once; the next call stays quiet", () => {
    const first = pickCheer(log(), 101, CORE, [], DAY2);
    expect(first.cheer).toEqual({ kind: "words", n: 100 });
    expect(first.log.words).toBe(100);
    expect(pickCheer(first.log, 104, CORE, [], "2026-10-11T10:00:00.000Z").cheer).toBeNull();
  });

  test("jumping past two milestones names only the highest", () => {
    expect(pickCheer(log(), 215, CORE, [], DAY2).cheer).toEqual({ kind: "words", n: 200 });
  });

  test("the whole core outranks a word milestone and marks it too", () => {
    const r = pickCheer(log({ words: 300 }), 460, { absorbed: 453, total: 453 }, [], DAY2);
    expect(r.cheer).toEqual({ kind: "core", total: 453 });
    expect(r.log).toMatchObject({ core: true, words: 400 });
  });

  test("a topic fires at half and at all, once each; a new topic starts where it is", () => {
    const fresh = pickCheer(log(), 60, CORE, [topic(7)], DAY2);
    expect(fresh.cheer).toBeNull(); // added already 70% known: not "half done"
    const half = pickCheer(log({ topics: { bcn: 0 } }), 60, CORE, [topic(5)], DAY2);
    expect(half.cheer).toMatchObject({ kind: "topic", pct: 50, passed: 5, total: 10 });
    expect(pickCheer(half.log, 60, CORE, [topic(6)], "2026-10-11T10:00:00.000Z").cheer).toBeNull();
    expect(pickCheer(half.log, 60, CORE, [topic(10)], "2026-10-11T10:00:00.000Z").cheer).toMatchObject({ pct: 100 });
  });

  test("one line a day: a second milestone the same day waits for tomorrow", () => {
    const today = pickCheer(log(), 101, CORE, [], DAY1);
    expect(today.cheer).not.toBeNull();
    const waiting = { ...today.log, topics: { bcn: 0 } };
    expect(pickCheer(waiting, 101, CORE, [topic(5)], LATER_SAME_DAY).cheer).toBeNull();
    expect(pickCheer(waiting, 101, CORE, [topic(5)], DAY2).cheer).toMatchObject({ kind: "topic" });
  });

  test("a week with gains gets its tally; a quiet week passes without a word and starts a new one", () => {
    const gained = pickCheer(log(), 83, CORE, [], WEEK_ON);
    expect(gained.cheer).toEqual({ kind: "week", gained: 23 });
    expect(gained.log).toMatchObject({ weekAt: WEEK_ON, weekBase: 83 });
    const quiet = pickCheer(log(), 60, CORE, [], WEEK_ON);
    expect(quiet.cheer).toBeNull();
    expect(quiet.log).toMatchObject({ weekAt: WEEK_ON, weekBase: 60 });
    expect(pickCheer(log(), 83, CORE, [], DAY2).cheer).toBeNull(); // not a week yet
  });

  test("never a loss: fewer words than last week is silent", () => {
    expect(pickCheer(log({ weekBase: 90 }), 80, CORE, [], WEEK_ON).cheer).toBeNull();
  });
});

describe("cheerLine", () => {
  test("asks for one closing line in the learned language, with the number", () => {
    const line = cheerLine({ kind: "words", n: 100 }, "Italian");
    expect(line).toContain("absorbed 100 Italian words");
    expect(line).toContain("one short 🎉 line in Italian");
    expect(line).toContain("🎉");
    expect(cheerLine({ kind: "topic", slug: "b", title: "Barcelona", pct: 50, passed: 5, total: 10 }, "Spanish")).toContain('half way through the topic "Barcelona" (5/10)');
  });
});

describe("milestoneBar", () => {
  test("fills from the last milestone to the next", () => {
    expect(milestoneBar(87, 453)).toBe("▓▓▓░░ 87/100");
    expect(milestoneBar(0, 453)).toBe("░░░░░ 0/50");
    expect(milestoneBar(100, 453)).toBe("░░░░░ 100/200");
    expect(milestoneBar(420, 453)).toBe("▓░░░░ 420/453");
    expect(milestoneBar(453, 453)).toBeNull();
  });
});

describe("the hook", () => {
  const CLI = join(import.meta.dir, "..", "src", "cli.ts");
  const run = (dir: string, args: string[], prompt?: string, event = "UserPromptSubmit") =>
    spawnSync("bun", [CLI, ...args], { env: { ...process.env, LAZY_POLYGLOT_DIR: dir }, encoding: "utf8", ...(prompt !== undefined ? { input: JSON.stringify({ session_id: `s-${Math.random()}`, hook_event_name: event, prompt }) } : {}) });
  const setup = (absorbedWords: number, extra: object = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "lazy-polyglot-milestones-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({ lang: "it", native: "en", level: 4, algorithm: 3, ...extra }));
    const state: State = {};
    for (const w of loadWordlist("it").slice(0, absorbedWords)) state[w.id] = { exposures: 9, lastSeen: DAY1, step: ABSORBED_STEP, due: "2099-01-01T00:00:00.000Z" };
    writeFileSync(join(dir, "state.it.json"), JSON.stringify(state));
    return dir;
  };
  const config = (dir: string) => JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));

  test("an existing learner: the first turn only records, the next milestone then fires once", () => {
    const dir = setup(99);
    expect(run(dir, ["hook"], "Explain git rebase").stdout).not.toContain("Milestone");
    expect(config(dir).milestoneLog.it).toMatchObject({ words: 50, weekBase: 99 });
    const state = JSON.parse(readFileSync(join(dir, "state.it.json"), "utf8")) as State;
    const next = loadWordlist("it").find((w) => !state[w.id] || (state[w.id]!.step ?? 0) < ABSORBED_STEP)!;
    state[next.id] = { exposures: 9, lastSeen: DAY1, step: ABSORBED_STEP, due: "2099-01-01T00:00:00.000Z" };
    writeFileSync(join(dir, "state.it.json"), JSON.stringify(state));
    const hook = run(dir, ["hook"], "Explain git merge").stdout;
    expect(hook).toContain("absorbed 100 Italian words");
    expect(run(dir, ["hook"], "And cherry-pick?").stdout).not.toContain("Milestone");
    expect(run(dir, ["status"]).stdout).toContain("Next milestone: ░░░░░ 100/200");
  });

  test("SessionStart and `milestones off` never cheer; off hides the bar", () => {
    const dir = setup(120, { milestoneLog: { it: { words: 50, topics: {}, weekAt: DAY1, weekBase: 120 } } });
    expect(run(dir, ["hook"], "", "SessionStart").stdout).not.toContain("Milestone");
    expect(run(dir, ["milestones", "off"]).stdout).toContain("Milestones off");
    expect(run(dir, ["hook"], "Explain git rebase").stdout).not.toContain("Milestone");
    expect(run(dir, ["status"]).stdout).toContain("Milestones: off");
    expect(JSON.parse(run(dir, ["cards", "status"]).stdout).progress).toBeNull();
    run(dir, ["milestones", "on"]);
    expect(run(dir, ["hook"], "Explain git rebase").stdout).toContain("absorbed 100 Italian words");
    expect(JSON.parse(run(dir, ["cards", "status"]).stdout).progress).toBe("▓░░░░ 120/200");
  });
});
