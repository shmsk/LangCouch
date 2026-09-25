import { describe, expect, test } from "bun:test";
import { buildPlugin, runHook, type SpawnFn } from "../adapters/opencode/plugin.template.ts";
import type { Message, Part } from "@opencode-ai/sdk";

/**
 * The plugin template ships with `CLI_PATH = "__LANGCOUCH_CLI_PATH__"` as a
 * literal placeholder — the installer stamps the real path in at install time.
 * For these tests we never actually spawn (we inject a fake spawn), so the
 * placeholder is irrelevant.
 */

const LANGCOUCH_BLOCK = `<langcouch>
Passive language immersion. Replace ~4 words with Spanish ones from this list:
casa = house; tiempo = time; día = day; año = year
</langcouch>`;

/** Fake spawn that counts calls and returns a langcouch block on the first
 *  successful "bun" invocation. Tests can inspect `.calls` to verify dedup. */
function makeFakeSpawn(mode: "ok" | "empty" | "fail"): { spawn: SpawnFn; calls: { cmd: string; args: string[] }[] } {
  const calls: { cmd: string; args: string[] }[] = [];
  const spawn: SpawnFn = (cmd, args) => {
    calls.push({ cmd, args });
    if (mode === "fail") return { error: new Error("boom"), status: null };
    if (mode === "empty") return { status: 0, stdout: "" };
    // "ok": return the block only when invoked with "hook" (skip the `node -v` probe)
    if (args.includes("hook")) return { status: 0, stdout: LANGCOUCH_BLOCK };
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
    // only the first call should have spawned `langcouch hook`
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

  test("injection prepends the langcouch block to the user's text", async () => {
    const { spawn } = makeFakeSpawn("ok");
    const plugin = buildPlugin(spawn);
    const hooks = await plugin({} as never);
    const transform = hooks["experimental.chat.messages.transform"]!;

    const messages = userTurn("sess-1", "msg-1", "my actual prompt");
    await transform({}, { messages });
    const text = (messages[0]!.parts[0] as { text: string }).text;
    expect(text.startsWith("<langcouch>")).toBe(true);
    expect(text).toContain("my actual prompt");
    // block comes first, then the user's text
    expect(text.indexOf("<langcouch>")).toBeLessThan(text.indexOf("my actual prompt"));
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