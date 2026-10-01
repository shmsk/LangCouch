import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { installGemini, GEMINI_EVENTS } from "../adapters/gemini/install.ts";
import type { State } from "../src/types.ts";

describe("installGemini", () => {
  let dir: string;
  let cwd: string;
  beforeEach(() => {
    cwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), "langcouch-gemini-"));
    process.chdir(dir);
  });
  afterEach(() => process.chdir(cwd));
  const settings = () => JSON.parse(readFileSync(join(dir, ".gemini", "settings.json"), "utf8"));

  test("registers BeforeAgent, SessionStart, AfterAgent with --host gemini", () => {
    const out = installGemini("project");
    expect(out).toContain("beta");
    const s = settings();
    for (const event of GEMINI_EVENTS) {
      const entry = s.hooks[event][0].hooks[0];
      expect(entry).toMatchObject({ type: "command", name: "langcouch", timeout: 10000 });
      expect(entry.command).toEndWith("hook --host gemini");
    }
  });

  test("idempotent, and keeps the rest of settings.json", () => {
    mkdirSync(join(dir, ".gemini"));
    writeFileSync(join(dir, ".gemini", "settings.json"), JSON.stringify({ theme: "Dracula", hooks: { BeforeTool: [{ matcher: "x", hooks: [{ type: "command", command: "other" }] }] } }));
    installGemini("project");
    const once = readFileSync(join(dir, ".gemini", "settings.json"), "utf8");
    expect(installGemini("project")).toContain("already installed");
    expect(readFileSync(join(dir, ".gemini", "settings.json"), "utf8")).toBe(once);
    const s = settings();
    expect(s.theme).toBe("Dracula");
    expect(s.hooks.BeforeTool[0].hooks[0].command).toBe("other");
  });
});

describe("hook --host gemini", () => {
  const CLI = join(import.meta.dir, "..", "src", "cli.ts");
  const fresh = () => {
    const dir = mkdtempSync(join(tmpdir(), "langcouch-gemhook-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({ lang: "es", native: "en", level: 2, algorithm: 3 }));
    return dir;
  };
  const run = (dir: string, payload: object | string, extraEnv: Record<string, string> = {}) =>
    spawnSync("bun", [CLI, "hook", "--host", "gemini"], { env: { ...process.env, LANGCOUCH_DIR: dir, ...extraEnv }, input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8" });
  const base = { session_id: "g1", transcript_path: "/nonexistent.json", cwd: "/tmp", timestamp: "2026-10-01T10:00:00Z" };

  test("BeforeAgent → JSON with additionalContext, no decision", () => {
    const r = run(fresh(), { ...base, hook_event_name: "BeforeAgent", prompt: "Let's plan the next release" });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("BeforeAgent");
    expect(out.hookSpecificOutput.additionalContext).toContain("<langcouch>");
    expect(out.decision).toBeUndefined();
  });

  test("SessionStart → JSON too", () => {
    const out = JSON.parse(run(fresh(), { ...base, hook_event_name: "SessionStart", source: "startup" }).stdout);
    expect(out.hookSpecificOutput.additionalContext).toContain("<langcouch>");
  });

  test("AfterAgent counts the words prompt_response wove, prints {}", () => {
    const dir = fresh();
    run(dir, { ...base, hook_event_name: "BeforeAgent", prompt: "hi there friend" });
    const offer = JSON.parse(readFileSync(join(dir, "served.json"), "utf8")).g1.picks as Record<string, string>;
    const [wovenId, lemma] = Object.entries(offer)[0]!;
    const r = run(dir, { ...base, hook_event_name: "AfterAgent", prompt: "hi there friend", prompt_response: `Sure, **${lemma}** (x).`, stop_hook_active: false });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("{}");
    const state = JSON.parse(readFileSync(join(dir, "state.es.json"), "utf8")) as State;
    expect(state[wovenId!]).toMatchObject({ exposures: 1, step: 1 });
  });

  test("paused, broken config or garbage stdin: still exit 0 with a JSON object", () => {
    const paused = fresh();
    writeFileSync(join(paused, "config.json"), JSON.stringify({ lang: "es", native: "en", level: 2, enabled: false }));
    const broken = fresh();
    writeFileSync(join(broken, "config.json"), "{not json");
    for (const [dir, payload] of [[paused, { ...base, hook_event_name: "BeforeAgent", prompt: "hello there" }], [broken, { ...base, hook_event_name: "BeforeAgent", prompt: "hello there" }], [fresh(), "garbage"]] as const) {
      const r = run(dir, payload);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toBeObject();
    }
  });

  test("without --host gemini the hook still prints plain text", () => {
    const r = spawnSync("bun", [CLI, "hook"], { env: { ...process.env, LANGCOUCH_DIR: fresh() }, input: JSON.stringify({ ...base, hook_event_name: "UserPromptSubmit", prompt: "hello there" }), encoding: "utf8" });
    expect(r.stdout.startsWith("<langcouch>")).toBe(true);
  });
});
