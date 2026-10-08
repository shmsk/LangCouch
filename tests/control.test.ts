import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { detectControl, detectTrouble, troubleLine, controlCommand, controlLine } from "../src/control.ts";

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

describe("detectTrouble", () => {
  test.each([
    "Why does Lazy Polyglot keep showing the same words?",
    "lazy-polyglot stopped working after the update",
    "why are there Italian words in your answers",
    "почему ленивый полиглот не работает",
    "Lazy Polyglot перестал вставлять слова, почему?",
    "откуда итальянские слова в ответах, это баг?",
    "lazy polyglot ishlamayapti, nega?",
  ])("fires on %p", (p) => expect(detectTrouble(p)).toBe(true));

  test.each([
    "Switch my Lazy Polyglot language to French.",
    "why does the deploy fail on port 8080",
    "почему падает сборка?",
    "translate these Italian words into English",
    "Explain git rebase",
  ])("stays quiet on %p", (p) => expect(detectTrouble(p)).toBe(false));

  test("the line names the version, the changelog and an existing doc, and asks for no update", () => {
    const line = troubleLine("9.9.9");
    expect(line).toContain("Installed version: 9.9.9");
    expect(line).toContain("CHANGELOG");
    expect(line).toContain("don't update anything yourself");
    const doc = line.match(/using (\/\S+TROUBLESHOOTING\.md)/)![1]!;
    expect(existsSync(doc)).toBe(true);
  });

  test("the hook adds it on trouble, and a paused plugin still answers why it went quiet", () => {
    const CLI = join(import.meta.dir, "..", "src", "cli.ts");
    const dir = mkdtempSync(join(tmpdir(), "lazy-polyglot-trouble-"));
    const cfg = (enabled: boolean) => writeFileSync(join(dir, "config.json"), JSON.stringify({ lang: "es", native: "en", level: 2, algorithm: 3, enabled }));
    const run = (prompt: string, session: string) =>
      spawnSync("bun", [CLI, "hook"], { env: { ...process.env, LAZY_POLYGLOT_DIR: dir }, input: JSON.stringify({ session_id: session, hook_event_name: "UserPromptSubmit", prompt }), encoding: "utf8" }).stdout;
    cfg(true);
    expect(run("Why does Lazy Polyglot repeat words?", "a")).toContain("checking for a newer version");
    expect(run("Explain git rebase", "b")).not.toContain("newer version");
    cfg(false);
    expect(run("почему lazy polyglot не работает?", "c")).toContain("it is paused");
    expect(run("Explain git rebase", "d").trim()).toBe("");
  });
});
