import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { installAntigravity, antigravitySkills, ANTIGRAVITY_EVENTS, ANTIGRAVITY_RULE } from "../adapters/antigravity/install.ts";
import { antigravityTurn } from "../src/served.ts";
import type { State } from "../src/types.ts";

// The step shapes of a live agy 1.3.1 transcript_full.jsonl (trimmed): a turn that read a file
const step = (o: object) => JSON.stringify(o);
const TRANSCRIPT = [
  step({ step_index: 0, source: "USER_EXPLICIT", type: "USER_INPUT", status: "DONE", content: "<USER_REQUEST>\nPrima domanda\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-10-07T18:45:12+04:00.\n</ADDITIONAL_METADATA>" }),
  step({ step_index: 1, source: "SYSTEM_SDK", type: "EPHEMERAL_MESSAGE", status: "DONE", content: "<lazy-polyglot>old</lazy-polyglot>" }),
  step({ step_index: 2, source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", content: "old reply" }),
  step({ step_index: 3, source: "USER_EXPLICIT", type: "USER_INPUT", status: "DONE", content: "<USER_REQUEST>\nRead a.txt, please\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nmeta\n</ADDITIONAL_METADATA>" }),
  step({ step_index: 4, source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", thinking: "plan", tool_calls: [{ name: "view_file" }] }),
  step({ step_index: 5, source: "MODEL", type: "GENERIC", status: "DONE", content: "File Path: a.txt\nhello" }),
  step({ step_index: 6, source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", content: "It says hello, my **casa** friend." }),
].join("\n");

describe("antigravityTurn", () => {
  test("prompt is the last USER_REQUEST without metadata; reply is the text after it", () => {
    expect(antigravityTurn(TRANSCRIPT + "\nnot json")).toEqual({ prompt: "Read a.txt, please", reply: "It says hello, my **casa** friend." });
  });

  test("a turn still running has its prompt and no reply yet", () => {
    expect(antigravityTurn(TRANSCRIPT.split("\n").slice(0, 4).join("\n"))).toEqual({ prompt: "Read a.txt, please", reply: "" });
  });
});

describe("installAntigravity", () => {
  let dir: string;
  let cwd: string;
  beforeEach(() => {
    cwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), "lazy-polyglot-agy-"));
    process.chdir(dir);
  });
  afterEach(() => process.chdir(cwd));
  const pluginDir = () => join(dir, ".agents", "plugins", "lazy-polyglot");

  test("writes plugin.json, the rule, and hooks.json with PreInvocation and Stop", () => {
    expect(installAntigravity("project")).toContain("Plugin added");
    expect(JSON.parse(readFileSync(join(pluginDir(), "plugin.json"), "utf8"))).toEqual({ name: "lazy-polyglot" });
    expect(readFileSync(join(pluginDir(), "rules", "AGENTS.md"), "utf8")).toBe(ANTIGRAVITY_RULE);
    expect(ANTIGRAVITY_RULE).toContain("<lazy-polyglot>");
    const hooks = JSON.parse(readFileSync(join(pluginDir(), "hooks.json"), "utf8"))["lazy-polyglot"];
    for (const event of ANTIGRAVITY_EVENTS) {
      expect(hooks[event][0]).toMatchObject({ type: "command", timeout: 10 });
      expect(hooks[event][0].command).toEndWith(`hook --host antigravity --event ${event}`);
    }
  });

  test("idempotent; a foreign hooks.json is never overwritten", () => {
    installAntigravity("project");
    const once = readFileSync(join(pluginDir(), "hooks.json"), "utf8");
    expect(installAntigravity("project")).toContain("already installed");
    expect(readFileSync(join(pluginDir(), "hooks.json"), "utf8")).toBe(once);
    writeFileSync(join(pluginDir(), "hooks.json"), JSON.stringify({ other: { Stop: [] } }));
    expect(() => installAntigravity("project")).toThrow("isn't ours");
  });

  test("skills mirror the Claude Code commands, minus the Claude-only ones", () => {
    installAntigravity("project");
    const names = readdirSync(join(pluginDir(), "skills")).sort();
    const commands = readdirSync(join(import.meta.dir, "..", "commands")).map((f) => f.replace(/\.md$/, ""));
    expect(names).toEqual(commands.filter((n) => n !== "spinner" && n !== "cards-status").sort());
    const lang = readFileSync(join(pluginDir(), "skills", "lang", "SKILL.md"), "utf8");
    expect(lang).toStartWith("---\nname: lang\ndescription: ");
    expect(lang).toContain("scripts/cli.sh\" lang <arguments>");
    for (const text of Object.values(antigravitySkills())) {
      expect(text).not.toContain("CLAUDE_PLUGIN_ROOT");
      expect(text).not.toContain("$ARGUMENTS");
    }
  });

  test("a skill no longer shipped is removed; nothing else in skills/ survives either", () => {
    installAntigravity("project");
    mkdirSync(join(pluginDir(), "skills", "old-skill"));
    writeFileSync(join(pluginDir(), "skills", "old-skill", "SKILL.md"), "old");
    expect(installAntigravity("project")).toContain("Plugin updated");
    expect(existsSync(join(pluginDir(), "skills", "old-skill"))).toBe(false);
    expect(installAntigravity("project")).toContain("already installed");
  });

  test("user scope goes to ~/.gemini/config/plugins", () => {
    const home = process.env.HOME;
    process.env.HOME = dir;
    try {
      installAntigravity("user");
      expect(existsSync(join(dir, ".gemini", "config", "plugins", "lazy-polyglot", "hooks.json"))).toBe(true);
    } finally {
      process.env.HOME = home;
    }
  });
});

describe("hook --host antigravity", () => {
  const CLI = join(import.meta.dir, "..", "src", "cli.ts");
  const fresh = () => {
    const dir = mkdtempSync(join(tmpdir(), "lazy-polyglot-agyhook-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({ lang: "es", native: "en", level: 2, algorithm: 3 }));
    writeFileSync(join(dir, "transcript.jsonl"), TRANSCRIPT.split("\n").slice(0, 4).join("\n"));
    return dir;
  };
  const run = (dir: string, event: string, payload: object | string) =>
    spawnSync("bun", [CLI, "hook", "--host", "antigravity", "--event", event], { env: { ...process.env, LAZY_POLYGLOT_DIR: dir }, input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8" });
  const base = (dir: string) => ({ conversationId: "c1", transcriptPath: join(dir, "transcript.jsonl"), workspacePaths: ["/tmp"], modelName: "auto" });
  const served = (dir: string) => JSON.parse(readFileSync(join(dir, "served.json"), "utf8"));

  test("first call of a turn → injectSteps with the instruction, offer recorded once", () => {
    const dir = fresh();
    const r = run(dir, "PreInvocation", { ...base(dir), invocationNum: 0, initialNumSteps: 1 });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.injectSteps).toHaveLength(1);
    expect(out.injectSteps[0].ephemeralMessage).toContain("<lazy-polyglot>");
    expect(Object.keys(served(dir))).toEqual(["c1"]);
  });

  test("later calls of the turn repeat the same instruction and count nothing", () => {
    const dir = fresh();
    const first = run(dir, "PreInvocation", { ...base(dir), invocationNum: 0 }).stdout;
    const servedAfterFirst = readFileSync(join(dir, "served.json"), "utf8");
    const second = run(dir, "PreInvocation", { ...base(dir), invocationNum: 1 });
    expect(second.status).toBe(0);
    expect(second.stdout).toBe(first);
    expect(readFileSync(join(dir, "served.json"), "utf8")).toBe(servedAfterFirst);
    // another conversation never inherits this turn's instruction
    expect(run(dir, "PreInvocation", { ...base(dir), conversationId: "c2", invocationNum: 3 }).stdout.trim()).toBe("{}");
  });

  test("Stop reads the reply from the transcript and settles the offer", () => {
    const dir = fresh();
    run(dir, "PreInvocation", { ...base(dir), invocationNum: 0 });
    const offered = Object.values(served(dir).c1.picks as Record<string, string>);
    writeFileSync(join(dir, "transcript.jsonl"), TRANSCRIPT.replace("my **casa** friend", `my **${offered[0]}** friend`));
    const r = run(dir, "Stop", { ...base(dir), executionNum: 0, terminationReason: "NO_TOOL_CALL", fullyIdle: true });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("{}");
    expect(served(dir).c1).toMatchObject({ picks: {}, stopSeen: true });
    const state = JSON.parse(readFileSync(join(dir, "state.es.json"), "utf8")) as State;
    expect(Object.values(state).some((s) => s.exposures > 0)).toBe(true);
  });

  test("garbage stdin never breaks the turn", () => {
    for (const event of ANTIGRAVITY_EVENTS) {
      const r = run(fresh(), event, "{not json");
      expect(r.status).toBe(0);
      expect(() => JSON.parse(r.stdout)).not.toThrow();
    }
  });
});
