import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { levelHint, mergeTopics, planPace, topicId, topicLine, topicProgress, validateTopic, type Topic, type TopicFile } from "../src/topics.ts";
import { loadWordlist } from "../src/store.ts";
import { pickLadder } from "../src/ladder.ts";
import { pickWords, unlockedWords } from "../src/scheduler.ts";
import { wovenLemmas } from "../src/weave-detect.ts";
import { checkReverse } from "../src/cards.ts";
import { ABSORBED_STEP, type State, type WordState } from "../src/types.ts";

const NOW = "2026-10-09T10:00:00.000Z";
const absorbed: WordState = { exposures: 9, lastSeen: NOW, step: ABSORBED_STEP, due: "2026-11-01T00:00:00.000Z" };

const draft = (over: Partial<Topic> = {}): Topic => ({
  title: "Barcelona restaurants",
  lang: "es",
  createdAt: NOW,
  active: true,
  entries: [
    { key: "water", target: "agua", kind: "word", conceptId: "water", gloss: { en: "water", ru: "вода" } },
    { key: "bill", target: "la cuenta", kind: "word", pos: "noun", gloss: { en: "the bill", ru: "счёт" } },
    { key: "bill_please", target: "la cuenta, por favor", kind: "phrase", gloss: { en: "the bill, please", ru: "счёт, пожалуйста" } },
    { key: "waiter", target: "camarero", kind: "word", pos: "noun", gloss: { en: "waiter", ru: "официант" } },
  ],
  ...over,
});
const file = (topic: Topic, slug = "barcelona"): TopicFile => ({ slug, path: `/x/es.${slug}.json`, topic });

describe("validateTopic", () => {
  test("a good topic passes", () => expect(validateTopic(draft(), "es")).toEqual([]));

  test("names every problem", () => {
    const bad = draft({
      lang: "it",
      by: "next week",
      entries: [
        { key: "Bad Key", target: "x".repeat(41), kind: "word", gloss: {} },
        { key: "dup", target: "a", kind: "phrase", gloss: { en: "a" }, conceptId: "no-such-concept" },
        { key: "dup", target: "b", kind: "sentence" as "word", gloss: { en: "b" } },
      ],
    });
    const errors = validateTopic(bad, "es").join("\n");
    for (const part of ['lang is "it"', "not YYYY-MM-DD", "key must be", "longer than 40", "needs a gloss", "not a core concept", "duplicate key", 'kind must be "word" or "phrase"']) {
      expect(errors).toContain(part);
    }
  });
});

describe("mergeTopics", () => {
  const core = loadWordlist("es");

  test("no topic: the list is exactly the core", () => expect(mergeTopics(core, [])).toBe(core));

  test("a core entry reuses the core word and its id; new entries get topic ids; topic words come first", () => {
    const merged = mergeTopics(core, [file(draft())]);
    expect(merged.length).toBe(core.length + 3);
    expect(merged.slice(0, 4).map((w) => w.id)).toEqual(["water", topicId("barcelona", "bill"), topicId("barcelona", "bill_please"), topicId("barcelona", "waiter")]);
    expect(merged.filter((w) => w.id === "water")).toHaveLength(1);
    expect(merged[0]!.topic).toBe("barcelona");
    expect(merged[2]!.phrase).toBe(true);
  });

  test("waiting entries join only once every open entry is started", () => {
    const t = draft();
    t.entries[3]!.waiting = true;
    expect(mergeTopics(core, [file(t)]).some((w) => w.target === "camarero")).toBe(false);
    const started: State = { water: absorbed, [topicId("barcelona", "bill")]: absorbed, [topicId("barcelona", "bill_please")]: absorbed };
    expect(mergeTopics(core, [file(t)], started).some((w) => w.target === "camarero")).toBe(true);
  });
});

describe("scheduling", () => {
  const core = loadWordlist("es");
  const merged = mergeTopics(core, [file(draft())]);

  test("topic words lead the ladder and the old picker; without a topic, picks are unchanged", () => {
    const ladder = pickLadder(unlockedWords(merged, {}), {}, 4, NOW).picks.map((p) => p.word.target);
    expect(ladder).toEqual(["agua", "la cuenta", "la cuenta, por favor", "camarero"]);
    expect(pickWords(unlockedWords(merged, {}), {}, 4).map((p) => p.word.target)).toEqual(["agua", "la cuenta", "la cuenta, por favor", "camarero"]);
    const plain = pickLadder(unlockedWords(core, {}), {}, 4, NOW).picks.map((p) => p.word.id);
    expect(plain).toEqual(core.slice(0, 4).map((w) => w.id));
  });

  test("topic-only words stay outside the tier gate", () => {
    const unlocked = unlockedWords(merged, {});
    expect(unlocked.filter((w) => w.id.startsWith("topic.")).length).toBe(3);
    expect(unlocked.length).toBe(merged.length);
  });
});

describe("phrases", () => {
  test("a woven phrase is counted, a lone part of it is not", () => {
    expect(wovenLemmas("At the end ask for **la cuenta, por favor** (the bill, please).", ["la cuenta, por favor"])).toEqual(["la cuenta, por favor"]);
    expect(wovenLemmas("Ask **por favor** (please).", ["la cuenta, por favor"])).toEqual([]);
  });

  test("a reverse card takes the whole phrase, accents and case folded", () => {
    const w = mergeTopics([], [file(draft())]).find((x) => x.phrase)!;
    expect(checkReverse("La cuenta, por favor", w)).toBe(true);
    expect(checkReverse("la cuenta", w)).toBe(false);
  });
});

describe("pace, progress, level", () => {
  const many = (n: number): Topic =>
    draft({ by: "2026-10-18", entries: Array.from({ length: n }, (_, i) => ({ key: `w${i}`, target: `palabra${i}`, kind: "word" as const, gloss: { en: `word ${i}` } })) });

  test("300 entries in 10 days: 200 fit, 100 wait, and it says so", () => {
    const { topic, note } = planPace(many(300), "big", {}, NOW);
    expect(topic.entries.filter((e) => !e.waiting)).toHaveLength(200);
    expect(topic.entries.slice(200).every((e) => e.waiting)).toBe(true);
    expect(note).toContain("the first 200 fit, the other 100 wait");
  });

  test("known entries don't use up the daily room", () => {
    const state: State = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [topicId("big", `w${i}`), absorbed]));
    expect(planPace(many(300), "big", state, NOW).topic.entries.some((e) => e.waiting)).toBe(false);
  });

  test("progress splits passed words and phrases, with days left", () => {
    const state: State = { water: absorbed, [topicId("barcelona", "bill_please")]: absorbed };
    const p = topicProgress(file(draft({ by: "2026-10-18" })), state, NOW);
    expect(topicLine(p)).toBe("Topic Barcelona restaurants: 2/4 passed (1 word, 1 phrase) · 10 days left");
  });

  test("levels 1-3 get a suggestion, higher levels none", () => {
    expect(levelHint(2)).toContain("Level 2 weaves 4 words a reply; level 6 weaves 8");
    expect(levelHint(2)).toContain("nothing was changed");
    expect(levelHint(4)).toBeNull();
  });
});

describe("topic command (real CLI, throwaway data dir)", () => {
  const CLI = join(import.meta.dir, "..", "src", "cli.ts");
  const setup = (level = 4) => {
    const dir = mkdtempSync(join(tmpdir(), "lazy-polyglot-topics-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({ lang: "es", native: "en", level, algorithm: 3 }));
    return dir;
  };
  const run = (dir: string, args: string[], prompt?: string) =>
    spawnSync("bun", [CLI, ...args], { env: { ...process.env, LAZY_POLYGLOT_DIR: dir }, encoding: "utf8", ...(prompt !== undefined ? { input: JSON.stringify({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt }) } : {}) });
  const write = (dir: string, name: string, t: Topic) => {
    const path = join(dir, "..", `${name}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(path, JSON.stringify(t));
    return path;
  };

  test("add, status, list, drop, end; progress survives the end", () => {
    const dir = setup(2);
    const { createdAt: _, active: __, ...bare } = draft({ by: "2026-12-31" });
    const added = run(dir, ["topic", "add", write(dir, "bcn", bare as Topic), "--name", "barcelona"]);
    expect(added.status).toBe(0);
    expect(added.stdout).toContain('Added topic "Barcelona restaurants" (barcelona): 4 entries, 3 words and 1 phrase.');
    expect(added.stdout).toContain("Level 2 weaves 4 words a reply"); // suggested, not applied
    expect(JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).level).toBe(2);
    expect(existsSync(join(dir, "topics", "es.barcelona.json"))).toBe(true);

    const hook = run(dir, ["hook"], "Explain git rebase").stdout;
    expect(hook).toContain("agua");
    expect(hook).toContain("la cuenta");

    expect(run(dir, ["status"]).stdout).toMatch(/Topic Barcelona restaurants: 0\/4 passed \(0 words, 0 phrases\) · \d+ days left/);
    expect(run(dir, ["topic", "drop", "barcelona", "camarero"]).stdout).toContain('Dropped "camarero"');
    expect(run(dir, ["topic", "list"]).stdout).toContain("barcelona: Barcelona restaurants · running · 0/3 passed");
    expect(run(dir, ["topic", "end", "barcelona"]).stdout).toContain("Ended topic");
    expect(run(dir, ["status"]).stdout).not.toContain("Topic Barcelona");
    expect(run(dir, ["topic", "list"]).stdout).toContain("· ended ·");
  });

  test("a third topic needs --yes, a fourth is refused, an ended one doesn't count", () => {
    const dir = setup();
    for (const n of ["one", "two"]) expect(run(dir, ["topic", "add", write(dir, n, draft({ title: n })), "--name", n]).status).toBe(0);
    const third = run(dir, ["topic", "add", write(dir, "three", draft({ title: "three" })), "--name", "three"]);
    expect(third.stdout).toContain("Are you sure? Add it again with --yes.");
    expect(existsSync(join(dir, "topics", "es.three.json"))).toBe(false);
    expect(run(dir, ["topic", "add", write(dir, "three", draft({ title: "three" })), "--name", "three", "--yes"]).status).toBe(0);
    const fourth = run(dir, ["topic", "add", write(dir, "four", draft({ title: "four" })), "--name", "four", "--yes"]);
    expect(fourth.status).toBe(1);
    expect(fourth.stdout).toContain("3 is the most");
    run(dir, ["topic", "end", "one"]);
    expect(run(dir, ["topic", "add", write(dir, "four", draft({ title: "four" })), "--name", "four", "--yes"]).status).toBe(0);
  });

  test("delete asks first, then removes the file; progress stays and comes back on re-add", () => {
    const dir = setup();
    run(dir, ["topic", "add", write(dir, "bcn", draft()), "--name", "barcelona"]);
    const id = topicId("barcelona", "bill");
    writeFileSync(join(dir, "state.es.json"), JSON.stringify({ [id]: absorbed }));
    const ask = run(dir, ["topic", "delete", "barcelona"]);
    expect(ask.status).toBe(0);
    expect(ask.stdout).toContain("for good? Its progress stays");
    expect(existsSync(join(dir, "topics", "es.barcelona.json"))).toBe(true);
    expect(run(dir, ["topic", "delete", "barcelona", "--yes"]).stdout).toContain('Deleted topic "Barcelona restaurants"');
    expect(existsSync(join(dir, "topics", "es.barcelona.json"))).toBe(false);
    expect(run(dir, ["topic", "list"]).stdout).toContain("No topics for es yet");
    expect(run(dir, ["topic", "delete", "barcelona", "--yes"]).status).toBe(1);
    run(dir, ["topic", "add", write(dir, "bcn", draft()), "--name", "barcelona"]);
    expect(run(dir, ["status"]).stdout).toContain("Topic Barcelona restaurants: 1/4 passed (1 word, 0 phrases)");
  });

  test("a broken topic file can be deleted", () => {
    const dir = setup();
    mkdirSync(join(dir, "topics"), { recursive: true });
    writeFileSync(join(dir, "topics", "es.broken.json"), "{ not json");
    expect(run(dir, ["topic", "delete", "broken", "--yes"]).stdout).toContain('Deleted topic "broken"');
  });

  test("a broken topic file never stops the hook and shows up in topic list", () => {
    const dir = setup();
    mkdirSync(join(dir, "topics"), { recursive: true });
    writeFileSync(join(dir, "topics", "es.broken.json"), "{ not json");
    expect(run(dir, ["hook"], "Explain git rebase").stdout).toContain("<lazy-polyglot>");
    expect(run(dir, ["topic", "list"]).stdout).toContain("broken: can't be used");
  });

  test("export carries a topic to another machine", () => {
    const a = setup();
    run(a, ["topic", "add", write(a, "bcn", draft()), "--name", "barcelona"]);
    const out = join(mkdtempSync(join(tmpdir(), "lazy-polyglot-topics-export-")), "export.json");
    expect(run(a, ["export", out]).status).toBe(0);
    const b = setup();
    expect(run(b, ["import", out]).status).toBe(0);
    expect(JSON.parse(readFileSync(join(b, "topics", "es.barcelona.json"), "utf8")).title).toBe("Barcelona restaurants");
  });
});
