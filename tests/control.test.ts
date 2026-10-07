import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { detectControl, controlCommand, controlLine } from "../src/control.ts";

describe("detectControl", () => {
  test.each([
    "Switch my Lazy Polyglot language to French.",
    "can you change lazy-polyglot to italian",
    "please switch to Spanish for the weaving",
    "change the target language",
    "Переключи язык на французский",
    "смени язык обучения на испанский",
    "хочу учить итальянский",
    "ленивый полиглот, поставь уровень 5",
    "tilni fransuz tiliga almashtir",
  ])("fires on %p", (p) => expect(detectControl(p)).toBe(true));

  test.each([
    "Explain in three sentences what a git rebase does.",
    "switch to the main branch and rebase",
    "change the button color to blue",
    "Переключи ветку на main",
    "напиши функцию на TypeScript",
    "In two sentences: what do people usually do on a free day?",
  ])("stays quiet on %p", (p) => expect(detectControl(p)).toBe(false));
});

describe("controlLine", () => {
  test("names this checkout's wrapper, quoted, and the lang command", () => {
    const cmd = controlCommand();
    const path = cmd.match(/^sh "(.+)"$/)![1]!;
    expect(existsSync(path)).toBe(true);
    expect(path).toEndWith(join("scripts", "cli.sh"));
    expect(controlLine(cmd)).toContain(`\`${cmd} lang <code>\``);
  });

  test("the hook adds it only when the prompt asks", () => {
    const CLI = join(import.meta.dir, "..", "src", "cli.ts");
    const dir = mkdtempSync(join(tmpdir(), "lazy-polyglot-control-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({ lang: "es", native: "en", level: 2, algorithm: 3 }));
    const run = (prompt: string, session: string, plugin = "") =>
      spawnSync("bun", [CLI, "hook"], { env: { ...process.env, LAZY_POLYGLOT_DIR: dir, CLAUDE_PLUGIN_ROOT: plugin }, input: JSON.stringify({ session_id: session, hook_event_name: "UserPromptSubmit", prompt }), encoding: "utf8" }).stdout;
    expect(run("Switch my Lazy Polyglot language to French.", "a")).toContain("scripts/cli.sh\" lang <code>");
    expect(run("Explain git rebase", "b")).not.toContain("Lazy Polyglot settings");
    // the Claude Code plugin has slash commands: point the user there, never hand over a shell command
    const claude = run("Switch my Lazy Polyglot language to French.", "c", "/plugin");
    expect(claude).toContain("/lazy-polyglot:lang <code>");
    expect(claude).not.toContain("cli.sh");
  });
});
