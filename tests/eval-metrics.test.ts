import { describe, expect, test } from "bun:test";
import { scoreReply, splitCode, glossMatches, inflects, type CaseSpec } from "../evals/metrics.ts";

const spec: CaseSpec = {
  served: [
    { target: "dejar", gloss: "to leave" },
    { target: "casa", gloss: "house" },
    { target: "tiempo", gloss: "time" },
  ],
  ruleSuffix: "-ista",
};

describe("weave eval metrics", () => {
  test("counts served words woven as **word** (gloss)", () => {
    const m = scoreReply("Go **casa** (house) early and **deja** (leave) the phone.", spec);
    expect(m.woven.sort()).toEqual(["casa", "dejar"]);
    expect(m.offList).toEqual([]);
    expect(m.wrongGloss).toEqual([]);
  });

  test("a self-gloss like tiempo (tiempo) is caught", () => {
    const m = scoreReply("Give it **tiempo** (tiempo).", spec);
    expect(m.selfGloss).toEqual(["tiempo (tiempo)"]);
    expect(m.wrongGloss.length).toBe(1);
  });

  test("off-list words are flagged, the rule word and a whole sentence are not", () => {
    const m = scoreReply("A **turista** (tourist) eats **comida** (food). **Me gusta mucho la casa** (I like the house a lot).", spec);
    expect(m.offList).toEqual(["comida"]);
    expect(m.ruleUsed).toBe(true);
    expect(m.sentence).toBe(true);
  });

  test("a served word inside code counts as touching code", () => {
    const m = scoreReply("Fix:\n```ts\nconst casa = 1;\n```\nand run `rm **x**`.", { ...spec, mustKeep: ["sumPrices"] });
    expect(m.codeTouched).toEqual(["casa in code", "** in code", "missing sumPrices"]);
  });

  test("code is split out before prose metrics", () => {
    expect(splitCode("a `casa` b\n```\ntiempo\n```\nc").prose).not.toContain("casa");
  });

  test("a served word used bare in prose is unformatted; English look-alikes are not", () => {
    expect(scoreReply("You need more tiempo and a case study.", spec).unformatted).toEqual(["tiempo"]);
    expect(inflects("case", "casa")).toBe(false);
    expect(inflects("dejamos", "dejar")).toBe(true);
    expect(inflects("casas", "casa")).toBe(true);
  });

  test("gloss match tolerates inflection, rejects a different meaning", () => {
    expect(glossMatches("houses", "house")).toBe(true);
    expect(glossMatches("leaving", "to leave")).toBe(true);
    expect(glossMatches("carry", "to leave")).toBe(false);
  });
});
