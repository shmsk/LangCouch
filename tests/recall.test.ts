import { describe, expect, test } from "bun:test";
import { scanRecalls, recordRecalls, applyQuizResult, checkAnswer, MIN_RECALL_LENGTH } from "../src/recall.ts";
import { isAbsorbed, QUIZ_FAIL_EXPOSURES, type Word, type State } from "../src/types.ts";

const mk = (target: string, ru = "перевод", en = "gloss"): Word => ({ id: `id-${target}`, target, pos: "noun", tier: 1, gloss: { ru, en } });

describe("scanRecalls", () => {
  const words = [mk("casa"), mk("tiempo"), mk("día"), mk("ir")];

  test("matches on word boundaries, case-insensitive, deduped; returns concept ids", () => {
    expect(scanRecalls("Mi CASA es grande, casa bonita", words)).toEqual(["id-casa"]);
    expect(scanRecalls("encasa несёт слово внутри", words)).toEqual([]); // no boundary hit
    expect(scanRecalls("ничего испанского здесь нет", words)).toEqual([]);
  });

  test("handles diacritics", () => {
    expect(scanRecalls("Buen día!", words)).toEqual(["id-día"]);
  });

  test("short targets are ignored — cognate/particle noise filter", () => {
    expect("ir".length).toBeLessThan(MIN_RECALL_LENGTH);
    expect(scanRecalls("voy a ir mañana", words)).toEqual([]);
  });

  test("scan of 325 words stays under the 100ms hook budget", () => {
    const letters = (i: number) => [...String(i)].map((d) => "abcdefghij"[Number(d)]).join("");
    const many = Array.from({ length: 325 }, (_, i) => mk(`palabra${letters(i)}`));
    const prompt = (`Разбери palabra${letters(13)} и palabra${letters(200)}, потом объясни git rebase подробно. `).repeat(40);
    const t0 = performance.now();
    const found = scanRecalls(prompt, many);
    const elapsed = performance.now() - t0;
    expect(found.sort()).toEqual([`id-palabra${letters(13)}`, `id-palabra${letters(200)}`]);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("absorbed formula", () => {
  const abs = (exposures: number, recalls?: number) => isAbsorbed({ exposures, lastSeen: "", recalls });

  test("exposure is not knowledge: 8 exposures without recall no longer absorbed", () => {
    expect(abs(8)).toBe(false);
    expect(abs(11)).toBe(false);
  });
  test(">=12 exposures absorb even with zero recalls", () => {
    expect(abs(12)).toBe(true);
  });
  test("1 recall ≈ 4 exposures", () => {
    expect(abs(4, 1)).toBe(true); // 4 + 4 = 8
    expect(abs(3, 1)).toBe(false); // 7 < 8
    expect(abs(0, 2)).toBe(true); // 8 ≥ 8
  });
  test("untouched word is not absorbed", () => {
    expect(isAbsorbed(undefined)).toBe(false);
  });
});

describe("recordRecalls", () => {
  test("increments recalls, keeps exposures and lastSeen", () => {
    const state: State = { casa: { exposures: 3, lastSeen: "2026-07-01T00:00:00Z" } };
    recordRecalls(state, ["casa", "tiempo"]);
    expect(state["casa"]).toEqual({ exposures: 3, lastSeen: "2026-07-01T00:00:00Z", recalls: 1 });
    expect(state["tiempo"]).toEqual({ exposures: 0, lastSeen: "", recalls: 1 });
  });
});

describe("quiz", () => {
  test("checkAnswer is loose: case, trim, ru/en, comma-separated variants, yo=ye", () => {
    const w = mk("casa", "дом, жилище", "house");
    expect(checkAnswer("  ДОМ ", w)).toBe(true);
    expect(checkAnswer("house", w)).toBe(true);
    expect(checkAnswer("жилище", w)).toBe(true);
    expect(checkAnswer("хата", w)).toBe(false);
    expect(checkAnswer("", w)).toBe(false);
    expect(checkAnswer("еж", mk("erizo", "ёж", "hedgehog"))).toBe(true);
  });

  test("success writes a recall into state", () => {
    const state: State = { casa: { exposures: 5, lastSeen: "" } };
    applyQuizResult(state, "casa", true);
    expect(state["casa"]?.recalls).toBe(1);
    expect(state["casa"]?.exposures).toBe(5);
  });

  test("failure drops the word out of the absorbed pool", () => {
    const state: State = { casa: { exposures: 20, lastSeen: "", recalls: 3 } };
    expect(isAbsorbed(state["casa"])).toBe(true);
    applyQuizResult(state, "casa", false);
    expect(isAbsorbed(state["casa"])).toBe(false);
    expect(state["casa"]?.recalls).toBe(0);
    expect(state["casa"]?.exposures).toBeLessThanOrEqual(QUIZ_FAIL_EXPOSURES);
  });
});
