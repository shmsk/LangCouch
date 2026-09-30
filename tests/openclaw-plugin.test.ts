import { describe, expect, test } from "bun:test";
import { buildPlugin, runCommand, type SpawnFn, type PluginApi, type PromptBuildEvent, type AgentContext } from "../adapters/openclaw/plugin.template.ts";

const BLOCK = "<langcouch>\ncasa = house\n</langcouch>";

function makeFakeSpawn(mode: "ok" | "empty" | "fail" | "throw") {
  const calls: { cmd: string; args: string[] }[] = [];
  const spawn: SpawnFn = (cmd, args) => {
    calls.push({ cmd, args });
    if (mode === "throw") throw new Error("spawn exploded");
    if (mode === "fail") return { error: new Error("ENOENT"), status: null };
    if (mode === "empty") return { status: 0, stdout: "" };
    if (args.includes("hook")) return { status: 0, stdout: BLOCK + "\n" };
    if (args.includes("lang") && args.includes("xx")) return { status: 1, stdout: "", stderr: "unknown language: xx" };
    return { status: 0, stdout: `ran: ${args.slice(1).join(" ")}` };
  };
  return { spawn, calls };
}

/** Register the plugin against a fake api and hand back the captured handlers. */
function load(spawn: SpawnFn) {
  let hook: ((e: PromptBuildEvent, c: AgentContext) => { prependContext: string } | undefined) | undefined;
  let command: ((c: { args?: string }) => { text: string }) | undefined;
  const api: PluginApi = {
    on: (_name, h) => { hook = h; },
    registerCommand: (def) => { command = def.handler; },
  };
  buildPlugin(spawn).register(api);
  return { hook: hook!, command: command! };
}

const hookCalls = (calls: { args: string[] }[]) => calls.filter((c) => c.args.includes("hook")).length;

describe("openclaw plugin — before_prompt_build", () => {
  test("returns the block as prependContext", () => {
    const { hook } = load(makeFakeSpawn("ok").spawn);
    expect(hook({ prompt: "p", currentUserMessage: "hola", currentUserMessageId: "m1" }, { sessionId: "s1" })).toEqual({ prependContext: BLOCK });
  });

  test("retries of one admitted request weave once", () => {
    const { spawn, calls } = makeFakeSpawn("ok");
    const { hook } = load(spawn);
    const ev = { prompt: "p", currentUserMessage: "hola", currentUserMessageId: "m1" };
    expect(hook(ev, { sessionId: "s1" })).toBeDefined();
    expect(hook(ev, { sessionId: "s1" })).toBeUndefined();
    expect(hook(ev, { sessionId: "s1" })).toBeUndefined();
    expect(hookCalls(calls)).toBe(1);
  });

  test("a new request id weaves again; sessions are independent", () => {
    const { spawn, calls } = makeFakeSpawn("ok");
    const { hook } = load(spawn);
    hook({ prompt: "a", currentUserMessageId: "m1" }, { sessionId: "s1" });
    hook({ prompt: "b", currentUserMessageId: "m2" }, { sessionId: "s1" });
    hook({ prompt: "a", currentUserMessageId: "m1" }, { sessionId: "s2" });
    expect(hookCalls(calls)).toBe(3);
  });

  test("sends currentUserMessage, falling back to prompt", () => {
    let seen = "";
    const spawn: SpawnFn = (_c, args, opts) => {
      if (args.includes("hook")) seen = JSON.parse(opts.input).prompt;
      return { status: 0, stdout: BLOCK };
    };
    const { hook } = load(spawn);
    hook({ prompt: "projected", currentUserMessage: "raw" }, {});
    expect(seen).toBe("raw");
    hook({ prompt: "projected" }, {});
    expect(seen).toBe("projected");
  });

  test("empty block, missing runtime, or a throwing spawn → undefined", () => {
    for (const mode of ["empty", "fail", "throw"] as const) {
      const { hook } = load(makeFakeSpawn(mode).spawn);
      expect(hook({ prompt: "x", currentUserMessageId: "m1" }, { sessionId: "s" })).toBeUndefined();
    }
  });
});

describe("openclaw plugin — /langcouch", () => {
  test("routes arguments and returns CLI output", () => {
    const { command } = load(makeFakeSpawn("ok").spawn);
    expect(command({ args: "level up" }).text).toBe("ran: level up");
  });

  test("shows stderr on CLI errors", () => {
    expect(runCommand("lang xx", makeFakeSpawn("ok").spawn)).toBe("unknown language: xx");
  });

  test("refuses unknown subcommands and survives a throwing spawn", () => {
    const { command } = load(makeFakeSpawn("throw").spawn);
    expect(command({ args: "install claude" }).text).toStartWith("Usage: /langcouch");
    expect(command({ args: "status" }).text).toBe("LangCouch: command failed.");
  });
});
