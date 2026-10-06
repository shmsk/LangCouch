import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SPINNER_MARKER,
  claudeSettingsPath,
  applySpinnerTips,
  countOurTips,
  pickSpinnerWords,
  readSettings,
  removeSpinnerTips,
  tipFor,
  writeSettingsIfChanged,
} from "../src/spinner.ts";
import type { State, Word } from "../src/types.ts";

const word = (id: string): Word => ({ id, target: id, pos: "adj", tier: 1, gloss: { en: `${id}-en`, ru: `${id}-ru` } });
const TIPS = [`${SPINNER_MARKER}frío = cold`, `${SPINNER_MARKER}caro = expensive`];

describe("apply/remove spinner tips", () => {
  test("missing key: created with tips only, removed without a trace", () => {
    const original = { theme: "dark", hooks: { Stop: [] } };
    const on = applySpinnerTips(original, TIPS);
    expect(on.spinnerTipsOverride).toEqual({ tips: TIPS });
    expect(removeSpinnerTips(on)).toEqual(original);
  });

  test("foreign tips and flags survive, ours are appended and removed", () => {
    const original = { spinnerTipsOverride: { excludeDefault: true, tips: ["mine", "also mine"] } };
    const on = applySpinnerTips(original, TIPS);
    expect(on.spinnerTipsOverride).toEqual({ excludeDefault: true, tips: ["mine", "also mine", ...TIPS] });
    expect(removeSpinnerTips(on)).toEqual(original);
  });

  test("re-applying replaces our tips instead of duplicating them", () => {
    const once = applySpinnerTips({}, TIPS);
    const twice = applySpinnerTips(once, [`${SPINNER_MARKER}rojo = red`]);
    expect(twice.spinnerTipsOverride).toEqual({ tips: [`${SPINNER_MARKER}rojo = red`] });
    expect(countOurTips(twice)).toBe(1);
  });

  test("user flags on the key keep it alive after our tips leave", () => {
    const on = applySpinnerTips({ spinnerTipsOverride: { excludeDefault: false } }, TIPS);
    expect(removeSpinnerTips(on)).toEqual({ spinnerTipsOverride: { excludeDefault: false, tips: [] } });
  });

  test("removal is by marker, so it cleans up even without any stored state", () => {
    const leftover = { spinnerTipsOverride: { tips: ["keep", `${SPINNER_MARKER}old = stale`] } };
    expect(removeSpinnerTips(leftover)).toEqual({ spinnerTipsOverride: { tips: ["keep"] } });
  });

  test("nothing of ours → the very same object comes back", () => {
    const s = { spinnerTipsOverride: { tips: ["keep"] } };
    expect(removeSpinnerTips(s)).toBe(s);
  });
});

describe("pickSpinnerWords", () => {
  test("in progress, not absorbed, most recent first, capped", () => {
    const words = ["a", "b", "c", "d"].map(word);
    const state: State = {
      a: { exposures: 2, lastSeen: "2026-01-01" },
      b: { exposures: 1, lastSeen: "2026-03-01" },
      c: { exposures: 4, lastSeen: "2026-04-01", recalls: 1 }, // absorbed
      // d never shown
    };
    expect(pickSpinnerWords(words, state, 5).map((w) => w.id)).toEqual(["b", "a"]);
    expect(pickSpinnerWords(words, state, 1).map((w) => w.id)).toEqual(["b"]);
  });

  test("tip uses the native gloss", () => {
    expect(tipFor(word("frío"), "ru")).toBe(`${SPINNER_MARKER}frío = frío-ru`);
  });
});

describe("settings file I/O", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "lazy-polyglot-spinner-"));

  test("malformed JSON throws — the caller writes nothing", () => {
    const d = dir();
    const path = join(d, "settings.json");
    writeFileSync(path, "{ not json");
    expect(() => readSettings(path)).toThrow();
    writeFileSync(path, "[1,2]");
    expect(() => readSettings(path)).toThrow(/not a JSON object/);
  });

  test("missing file reads as {}; unchanged content is not rewritten", () => {
    const d = dir();
    const path = join(d, "settings.json");
    expect(readSettings(path)).toEqual({});
    expect(writeSettingsIfChanged({}, {}, d, path)).toBe(false);
    expect(existsSync(path)).toBe(false);
  });

  test("on → off round-trip restores a 2-space settings file byte for byte, with a backup", () => {
    const d = dir();
    const path = join(d, "settings.json");
    const original = JSON.stringify({ model: "opus", spinnerTipsOverride: { tips: ["keep"] } }, null, 2) + "\n";
    writeFileSync(path, original);

    const before = readSettings(path);
    expect(writeSettingsIfChanged(before, applySpinnerTips(before, TIPS), d, path)).toBe(true);
    expect(countOurTips(readSettings(path))).toBe(2);
    expect(readFileSync(join(d, "settings.backup.json"), "utf8")).toBe(original);

    const on = readSettings(path);
    writeSettingsIfChanged(on, removeSpinnerTips(on), d, path);
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(existsSync(`${path}.lazy-polyglot.tmp`)).toBe(false);
  });
});

describe("tips written before the rename", () => {
  const legacy = ["LangCouch · frío = cold", "LangCouch · caro = expensive"];

  test("are counted, and the first write replaces them with new ones, foreign tips kept", () => {
    const before = { spinnerTipsOverride: { tips: ["mine", ...legacy] } };
    expect(countOurTips(before)).toBe(2);
    const after = applySpinnerTips(before, TIPS);
    expect(after.spinnerTipsOverride).toEqual({ tips: ["mine", ...TIPS] });
    expect(countOurTips(after)).toBe(2);
  });

  test("turning the spinner off leaves no old tip, and drops a key that only held them", () => {
    expect(removeSpinnerTips({ theme: "dark", spinnerTipsOverride: { tips: legacy } })).toEqual({ theme: "dark" });
  });
});

describe("settings path override", () => {
  const keep = { new: process.env.LAZY_POLYGLOT_CLAUDE_SETTINGS, old: process.env.LANGCOUCH_CLAUDE_SETTINGS };
  const restore = () => {
    for (const [name, v] of [["LAZY_POLYGLOT_CLAUDE_SETTINGS", keep.new], ["LANGCOUCH_CLAUDE_SETTINGS", keep.old]] as const) {
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  };

  test("the old LANGCOUCH_CLAUDE_SETTINGS name still works, the new one wins", () => {
    try {
      delete process.env.LAZY_POLYGLOT_CLAUDE_SETTINGS;
      process.env.LANGCOUCH_CLAUDE_SETTINGS = "/old/settings.json";
      expect(claudeSettingsPath()).toBe("/old/settings.json");
      process.env.LAZY_POLYGLOT_CLAUDE_SETTINGS = "/new/settings.json";
      expect(claudeSettingsPath()).toBe("/new/settings.json");
    } finally {
      restore();
    }
  });
});
