import { describe, expect, test } from "bun:test";
import { learnerState, buildStage, letterMap, parseJudge, judgePrompt } from "../evals/stages.ts";
import { loadWordlist } from "../src/store.ts";
import { isAbsorbed } from "../src/types.ts";

const words = loadWordlist("es");
const topics = [1, 2, 3].map((i) => ({ id: `t${i}`, prompt: `prompt ${i}` }));

describe("weave eval stages", () => {
  test("a learner state is the same on every call and absorbs the asked share", () => {
    const a = learnerState(words, 0.5, "seed");
    expect(learnerState(words, 0.5, "seed")).toEqual(a);
    const absorbed = words.filter((w) => isAbsorbed(a[w.id])).length;
    expect(absorbed).toBe(Math.round(words.length * 0.5));
    expect(learnerState(words, 0.5, "other")).not.toEqual(a);
  });

  test("stages serve the real scheduler's instructions, and topics rotate words", () => {
    const beginner = buildStage({ id: "b", absorbed: 0, level: 1 }, topics, "seed");
    expect(beginner.map((b) => b.spec.served.length)).toEqual([3, 3, 3]);
    expect(beginner[0]!.spec.served).not.toEqual(beginner[1]!.spec.served);
    expect(beginner[0]!.hasRule).toBe(false);

    const advanced = buildStage({ id: "a", absorbed: 0.9, level: 8 }, topics, "seed");
    expect(advanced[0]!.spec.served.length).toBe(10);
    expect(advanced[0]!.hasRule).toBe(true);
    expect(advanced[0]!.wantsSentence).toBe(true);
    expect(buildStage({ id: "a", absorbed: 0.9, level: 8 }, topics, "seed")).toEqual(advanced);
  });

  test("judge letters are a stable shuffle, and verdicts map back to models", () => {
    const letters = letterMap(["opus", "x/a", "y/b"], "k");
    expect(letterMap(["y/b", "opus", "x/a"], "k")).toEqual(letters);
    expect(Object.values(letters).sort()).toEqual(["opus", "x/a", "y/b"]);
    const [la, lb] = Object.keys(letters);
    const text = `Sure:\n{"${la}": {"answer": 5, "weave": 2, "why": "forced"}, "${lb}": {"answer": 9, "weave": 3}, "Z": {"answer": 4, "weave": 4}}`;
    expect(parseJudge(text, letters)).toEqual({ [letters[la!]!]: { answer: 5, weave: 2, why: "forced" } });
    expect(parseJudge("no json", letters)).toEqual({});
  });

  test("the judge learns the known words even when a case has no nudge", () => {
    const p = judgePrompt("task", ["muy"], { A: "a" }, [], ["médico", "salud"]);
    expect(p).toContain("médico, salud");
    expect(p).toContain("closing line like `word = translation`");
    expect(p).not.toContain("Exception:");
    expect(judgePrompt("task", ["casa"], { A: "a" })).not.toContain("already knows");
  });
});
