import { describe, expect, test } from "bun:test";
import { wovenPairs, stem, matchServed } from "./smoke/woven.ts";

describe("live smoke check: served words woven into a reply", () => {
  test("finds **word** (gloss) pairs", () => {
    expect(wovenPairs("Morning **luz** (light) resets the **cuerpo** (body).")).toEqual([
      { word: "luz", gloss: "light" },
      { word: "cuerpo", gloss: "body" },
    ]);
  });

  test("stems keep inflected forms matching", () => {
    expect(stem("casa")).toBe("cas");
    expect(stem("niño")).toBe("niñ");
    expect(stem("día")).toBe("día");
    expect(stem("flor")).toBe("flor");
  });

  test("counts served words, inflected or capitalised", () => {
    const reply = "**Casas** (houses) and **niñas** (girls) and **días** (days).";
    expect(matchServed(reply, ["casa", "niño", "día", "año"])).toEqual(["casa", "niño", "día"]);
  });

  test("a bold English phrase is not a served word", () => {
    expect(matchServed("Your **circadian rhythm** (body clock) shifts.", ["luz", "cuerpo"])).toEqual([]);
  });

  test("a served word without the (gloss) format does not count", () => {
    expect(matchServed("The luz and **cuerpo** matter.", ["luz", "cuerpo"])).toEqual([]);
  });
});
