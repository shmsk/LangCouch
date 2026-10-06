import { describe, expect, test } from "bun:test";
import { buildPlugin, runHook, type SpawnFn } from "../adapters/opencode/plugin.template.ts";
import type { Message, Part } from "@opencode-ai/sdk";

/**
 * The plugin template ships with `CLI_PATH = "__LAZY_POLYGLOT_CLI_PATH__"` as a
 * literal placeholder — the installer stamps the real path in at install time.
 * For these tests we never actually spawn (we inject a fake spawn), so the
 * placeholder is irrelevant.
 */

const LAZY_POLYGLOT_BLOCK = `<lazy-polyglot>
Passive language immersion. Replace ~4 words with Spanish ones from this list:
casa = house; tiempo = time; día = day; año = year
</lazy-polyglot>`;

/** Fake spawn that counts calls and returns a lazy-polyglot block on the first
 *  successful "bun" invocation. Tests can inspect `.calls` to verify dedup. */
function makeFakeSpawn(mode: "ok" | "empty" | "fail"): { spawn: SpawnFn; calls: { cmd: string; args: string[] }[] } {
  const calls: { cmd: string; args: string[] }[] = [];
  const spawn: SpawnFn = (cmd, args) => {
    calls.push({ cmd, args });
    if (mode === "fail") return { error: new Error("boom"), status: null };
    if (mode === "empty") return { status: 0, stdout: "" };
    // "ok": return the block only when invoked with "hook" (skip the `node -v` probe)
    if (args.includes("hook")) return { status: 0, stdout: LAZY_POLYGLOT_BLOCK };
    return { status: 0, stdout: "v23.0.0\n" }; // pretend node exists so the bun-only path isn't the only one
  };
  return { spawn, calls };
}

/** Build a minimal messages array shape matching the opencode plugin hook.
 *  Casts to the full Message/Part types — the plugin only reads id/sessionID/role
 *  and parts[].type/text, so a partial fixture is fine for the test. */
function userTurn(sessionId: string, messageId: string, text: string): { info: Message; parts: Part[] }[] {
  return [
    {
      info: {
        id: messageId,
        sessionID: sessionId,
        role: "user",
        time: { created: 0 },
        agent: "build",
        model: { providerID: "p", modelID: "m" },
      } as Message,
      parts: [{ id: "p1", sessionID: sessionId, messageID: messageId, type: "text", text } as Part],
    },
  ];
}

describe("opencode plugin — turn-scoped dedup", () => {
  test("one user turn fires the hook only once, even if transform fires N times", async () => {
    const { spawn, calls } = makeFakeSpawn("ok");
    const plugin = buildPlugin(spawn);
    const hooks = await plugin({} as never);
    const transform = hooks["experimental.chat.messages.transform"]!;

    const messages = userTurn("sess-1", "msg-1", "why is the deploy failing?");
    // simulate the agentic loop: transform fires 5 times for one user turn
    for (let i = 0; i < 5; i++) {
      await transform({}, { messages });
    }
    // only the first call should have spawned `lazy-polyglot hook`
    const hookCalls = calls.filter((c) => c.args.includes("hook"));
    expect(hookCalls.length).toBe(1);
  });

  test("a new user turn (different info.id) fires the hook again", async () => {
    const { spawn, calls } = makeFakeSpawn("ok");
    const plugin = buildPlugin(spawn);
    const hooks = await plugin({} as never);
    const transform = hooks["experimental.chat.messages.transform"]!;

    await transform({}, { messages: userTurn("sess-1", "msg-1", "first prompt") });
    await transform({}, { messages: userTurn("sess-1", "msg-1", "first prompt") }); // same turn, dedup
    await transform({}, { messages: userTurn("sess-1", "msg-2", "second prompt") }); // new turn

    const hookCalls = calls.filter((c) => c.args.includes("hook"));
    expect(hookCalls.length).toBe(2); // one per user turn
  });

  test("different sessions don't collide — each session dedupes independently", async () => {
    const { spawn, calls } = makeFakeSpawn("ok");
    const plugin = buildPlugin(spawn);
    const hooks = await plugin({} as never);
    const transform = hooks["experimental.chat.messages.transform"]!;

    // two sessions, same message id, different sessionID — both should fire
    await transform({}, { messages: userTurn("sess-A", "msg-1", "hi") });
    await transform({}, { messages: userTurn("sess-B", "msg-1", "hi") });
    await transform({}, { messages: userTurn("sess-A", "msg-1", "hi") }); // dedup for A
    await transform({}, { messages: userTurn("sess-B", "msg-1", "hi") }); // dedup for B

    const hookCalls = calls.filter((c) => c.args.includes("hook"));
    expect(hookCalls.length).toBe(2); // one per session
  });

  test("empty block from hook is still marked handled (no re-fire on next step)", async () => {
    const { spawn, calls } = makeFakeSpawn("empty");
    const plugin = buildPlugin(spawn);
    const hooks = await plugin({} as never);
    const transform = hooks["experimental.chat.messages.transform"]!;

    const messages = userTurn("sess-1", "msg-1", "paused or all absorbed");
    // 3 agentic steps — without the marker-before-empty-return fix, all 3 would fire
    await transform({}, { messages });
    await transform({}, { messages });
    await transform({}, { messages });

    const hookCalls = calls.filter((c) => c.args.includes("hook"));
    expect(hookCalls.length).toBe(1);
  });

  test("failed spawn (no runtime available) — still marked handled, no exception", async () => {
    const { spawn, calls } = makeFakeSpawn("fail");
    const plugin = buildPlugin(spawn);
    const hooks = await plugin({} as never);
    const transform = hooks["experimental.chat.messages.transform"]!;

    const messages = userTurn("sess-1", "msg-1", "broken environment");
    await expect(transform({}, { messages })).resolves.toBeUndefined();
    await expect(transform({}, { messages })).resolves.toBeUndefined(); // dedup, no second attempt
    const hookCalls = calls.filter((c) => c.args.includes("hook"));
    expect(hookCalls.length).toBe(1);
  });

  test("injection prepends the lazy-polyglot block to the user's text", async () => {
    const { spawn } = makeFakeSpawn("ok");
    const plugin = buildPlugin(spawn);
    const hooks = await plugin({} as never);
    const transform = hooks["experimental.chat.messages.transform"]!;

    const messages = userTurn("sess-1", "msg-1", "my actual prompt");
    await transform({}, { messages });
    const text = (messages[0]!.parts[0] as { text: string }).text;
    expect(text.startsWith("<lazy-polyglot>")).toBe(true);
    expect(text).toContain("my actual prompt");
    // block comes first, then the user's text
    expect(text.indexOf("<lazy-polyglot>")).toBeLessThan(text.indexOf("my actual prompt"));
  });

  test("hook errors swallowed — never throws, never breaks the host session", async () => {
    const spawn: SpawnFn = () => {
      throw new Error("spawn blew up");
    };
    const plugin = buildPlugin(spawn);
    const hooks = await plugin({} as never);
    const transform = hooks["experimental.chat.messages.transform"]!;

    // the try/catch around the whole transform body should swallow this
    await expect(transform({}, { messages: userTurn("s", "m", "hi") })).resolves.toBeUndefined();
  });
});

describe("runHook — runtime detection (smoke)", () => {
  test("prefers bun when available, returns its stdout", () => {
    const spawn: SpawnFn = (cmd, args) => {
      if (cmd === "bun" && args.includes("hook")) return { status: 0, stdout: "BUN_BLOCK" };
      if (cmd === "node" && args[0] === "-v") return { status: 0, stdout: "v23.0.0\n" };
      return { status: 1, stdout: "" };
    };
    expect(runHook("prompt", "sess", spawn)).toBe("BUN_BLOCK");
  });

  test("falls back to node >=23 when bun is missing", () => {
    const spawn: SpawnFn = (cmd, args) => {
      if (cmd === "bun") return { error: new Error("no bun"), status: null };
      if (cmd === "node" && args[0] === "-v") return { status: 0, stdout: "v23.5.0\n" };
      if (cmd === "node" && args.includes("hook")) return { status: 0, stdout: "NODE23_BLOCK" };
      return { status: 1, stdout: "" };
    };
    expect(runHook("prompt", "sess", spawn)).toBe("NODE23_BLOCK");
  });

  test("returns empty string when no runtime is available", () => {
    const spawn: SpawnFn = () => ({ error: new Error("no runtimes"), status: null });
    expect(runHook("prompt", "sess", spawn)).toBe("");
  });
});
describe("opencode plugin — after-reply (session.idle)", () => {
  type Spawned = { cmd: string; args: string[]; input?: string };
  function recording() {
    const spawned: Spawned[] = [];
    const spawn: SpawnFn = (cmd, args, opts) => {
      spawned.push({ cmd, args, input: opts.input });
      return { status: 0, stdout: "" };
    };
    return { spawn, spawned };
  }
  const stops = (spawned: Spawned[]) => spawned.filter((c) => c.args.includes("hook")).map((c) => JSON.parse(c.input ?? "{}"));
  const asst = (id: string, ...texts: string[]) => ({
    info: { id, role: "assistant" },
    parts: texts.map((text) => ({ type: "text", text })),
  });
  const idle = (sessionID: string) => ({ event: { type: "session.idle", properties: { sessionID } } as never });
  const clientOf = (items: unknown, wrap = true) => ({
    session: { messages: async () => (wrap ? { data: items } : items) },
  });

  test("sends exactly one Stop payload with the last assistant text", async () => {
    const { spawn, spawned } = recording();
    const items = [{ info: { id: "u1", role: "user" }, parts: [{ type: "text", text: "q" }] }, asst("a0", "old"), asst("a1", "hola", "casa")];
    const hooks = await buildPlugin(spawn)({ client: clientOf(items) } as never);
    await hooks.event!(idle("s1"));
    const sent = stops(spawned);
    expect(sent.length).toBe(1);
    expect(sent[0]).toEqual({ hook_event_name: "Stop", session_id: "s1", last_assistant_message: "hola\ncasa" });
  });

  test("accepts a bare array result and does not resend the same assistant message", async () => {
    const { spawn, spawned } = recording();
    const hooks = await buildPlugin(spawn)({ client: clientOf([asst("a1", "uno")], false) } as never);
    await hooks.event!(idle("s1"));
    await hooks.event!(idle("s1"));
    expect(stops(spawned).length).toBe(1);
  });

  test("a new assistant message id sends again", async () => {
    const { spawn, spawned } = recording();
    let items = [asst("a1", "uno")];
    const client = { session: { messages: async () => ({ data: items }) } };
    const hooks = await buildPlugin(spawn)({ client } as never);
    await hooks.event!(idle("s1"));
    items = [asst("a1", "uno"), asst("a2", "dos")];
    await hooks.event!(idle("s1"));
    expect(stops(spawned).map((p) => p.last_assistant_message)).toEqual(["uno", "dos"]);
  });

  test("falls back to properties.sessionId / id, and to the client passed to buildPlugin", async () => {
    const { spawn, spawned } = recording();
    const hooks = await buildPlugin(spawn, clientOf([asst("a1", "x")]))({} as never);
    await hooks.event!({ event: { type: "session.idle", properties: { sessionId: "sA" } } as never });
    await hooks.event!({ event: { type: "session.idle", properties: { id: "sB" } } as never });
    expect(stops(spawned).map((p) => p.session_id)).toEqual(["sA", "sB"]);
  });

  test("no text, other events, malformed payloads, missing or throwing client send nothing and never throw", async () => {
    const { spawn, spawned } = recording();
    const noText = await buildPlugin(spawn)({ client: clientOf([{ info: { id: "a1", role: "assistant" }, parts: [{ type: "tool" }] }]) } as never);
    await noText.event!(idle("s1"));

    const ok = await buildPlugin(spawn)({ client: clientOf([asst("a1", "x")]) } as never);
    await ok.event!({ event: { type: "session.updated", properties: { sessionID: "s1" } } as never });
    await ok.event!({ event: { type: "session.idle" } as never });
    await ok.event!({ event: undefined as never });
    await (ok.event as any)(undefined);

    const noClient = await buildPlugin(spawn)({} as never);
    await noClient.event!(idle("s1"));

    const throwing = await buildPlugin(spawn)({ client: { session: { messages: async () => { throw new Error("rpc"); } } } } as never);
    await expect(throwing.event!(idle("s1"))).resolves.toBeUndefined();

    const garbage = await buildPlugin(spawn)({ client: clientOf("nope") } as never);
    await expect(garbage.event!(idle("s1"))).resolves.toBeUndefined();

    expect(spawned.length).toBe(0);
  });
});
