import { describe, expect, test } from "bun:test";
import { buildPlugin, runCommand, type SpawnFn, type PluginApi, type PromptBuildEvent, type AgentContext, type AgentEndEvent } from "../adapters/openclaw/plugin.template.ts";

const BLOCK = "<lazy-polyglot>\ncasa = house\n</lazy-polyglot>";

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
  let agentEnd: ((e: AgentEndEvent, c: AgentContext) => void) | undefined;
  let command: ((c: { args?: string }) => { text: string }) | undefined;
  const api: PluginApi = {
    on: ((name: string, h: unknown) => {
      if (name === "agent_end") agentEnd = h as typeof agentEnd;
      else hook = h as typeof hook;
    }) as PluginApi["on"],
    registerCommand: (def) => { command = def.handler; },
  };
  buildPlugin(spawn).register(api);
  return { hook: hook!, agentEnd: agentEnd!, command: command! };
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

describe("openclaw plugin — /lazy-polyglot", () => {
  test("routes arguments and returns CLI output", () => {
    const { command } = load(makeFakeSpawn("ok").spawn);
    expect(command({ args: "level up" }).text).toBe("ran: level up");
    expect(command({ args: "import ~/b.json" }).text).toBe("ran: import ~/b.json");
    expect(command({ args: "export" }).text).toBe("ran: export");
  });

  test("shows stderr on CLI errors", () => {
    expect(runCommand("lang xx", makeFakeSpawn("ok").spawn)).toBe("unknown language: xx");
  });

  test("refuses unknown subcommands and survives a throwing spawn", () => {
    const { command } = load(makeFakeSpawn("throw").spawn);
    expect(command({ args: "install claude" }).text).toStartWith("Usage: /lazy-polyglot");
    expect(command({ args: "status" }).text).toBe("Lazy Polyglot: command failed.");
  });
});

const stopCalls = (spawned: { cmd: string; args: string[]; input?: string }[]) =>
  spawned.filter((c) => c.args.includes("hook")).map((c) => JSON.parse(c.input ?? "{}"));

function loadRecording(mode: "ok" | "throw" = "ok") {
  const spawned: { cmd: string; args: string[]; input?: string }[] = [];
  const spawn: SpawnFn = (cmd, args, opts) => {
    spawned.push({ cmd, args, input: opts.input });
    if (mode === "throw") throw new Error("boom");
    return { status: 0, stdout: "" };
  };
  return { ...load(spawn), spawned };
}

describe("openclaw plugin — agent_end", () => {
  test("sends one Stop payload with the reply text and session id", () => {
    const { agentEnd, spawned } = loadRecording();
    agentEnd({ runId: "r1", success: true, messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hola casa" }] }, { sessionId: "s1" });
    const sent = stopCalls(spawned);
    expect(sent.length).toBe(1);
    expect(sent[0]).toEqual({ hook_event_name: "Stop", session_id: "s1", last_assistant_message: "hola casa" });
  });

  test("a repeated runId does not resend; a new runId does", () => {
    const { agentEnd, spawned } = loadRecording();
    const ev = { runId: "r1", success: true, messages: [{ role: "assistant", content: "uno" }] };
    agentEnd(ev, { sessionId: "s1" });
    agentEnd(ev, { sessionId: "s1" });
    expect(stopCalls(spawned).length).toBe(1);
    agentEnd({ ...ev, runId: "r2" }, { sessionId: "s1" });
    expect(stopCalls(spawned).length).toBe(2);
  });

  test("handles content-part arrays, nested message wrappers, and sessionKey fallback", () => {
    const { agentEnd, spawned } = loadRecording();
    agentEnd({ success: true, messages: [{ message: { role: "assistant", content: [{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }] } }] }, { sessionKey: "k1" });
    const sent = stopCalls(spawned);
    expect(sent[0].last_assistant_message).toBe("a\nb");
    expect(sent[0].session_id).toBe("k1");
  });

  test("success:false, no assistant text, or malformed payloads send nothing and never throw", () => {
    const { agentEnd, spawned } = loadRecording();
    agentEnd({ success: false, messages: [{ role: "assistant", content: "x" }] }, { sessionId: "s" });
    agentEnd({ success: true, messages: [{ role: "assistant", content: [{ type: "tool_use" }] }] }, { sessionId: "s" });
    agentEnd({ success: true, messages: [{ role: "user", content: "x" }] }, { sessionId: "s" });
    agentEnd({ success: true, messages: [{ role: "assistant", content: "   " }] }, { sessionId: "s" });
    expect(() => agentEnd({ success: true, messages: "nope" as never }, { sessionId: "s" })).not.toThrow();
    expect(() => agentEnd(undefined as never, undefined as never)).not.toThrow();
    expect(() => agentEnd({ success: true, messages: [null, 5, {}] }, {})).not.toThrow();
    expect(spawned.length).toBe(0);
  });

  test("a throwing spawn is swallowed", () => {
    const { agentEnd } = loadRecording("throw");
    expect(() => agentEnd({ success: true, messages: [{ role: "assistant", content: "x" }] }, { sessionId: "s" })).not.toThrow();
  });
});
