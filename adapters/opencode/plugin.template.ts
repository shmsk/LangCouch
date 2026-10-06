import { spawnSync } from "node:child_process";
import type { Plugin, Hooks } from "@opencode-ai/plugin";

/* lazy-polyglot */

/**
 * Lazy Polyglot adapter for opencode.
 *
 * Primary path: this plugin is auto-discovered by opencode (any *.ts under
 * .opencode/plugin/ or ~/.config/opencode/plugin/). On every chat turn it
 * shells out to `lazy-polyglot hook`, feeds the latest user message as the prompt
 * payload, and prepends the emitted <lazy-polyglot>…</lazy-polyglot> block to that
 * user message's text — same context-injection contract as the Claude Code
 * UserPromptSubmit hook.
 *
 * Turn-scoped dedup: opencode's `experimental.chat.messages.transform` fires
 * inside the agentic tool-call loop, not once per user submission. Without
 * dedup, a turn that loops through N tool steps would run `lazy-polyglot hook`
 * and mark exposures N times — corrupting the SRS counts the tool exists to
 * keep honest. We key on `info.id` (the user-message id) within a session and
 * only handle a given user turn once.
 *
 * After-reply: on the `session.idle` event the plugin fetches the session's
 * messages, takes the last assistant message's text and sends it to
 * `lazy-polyglot hook` as a Stop payload so the CLI counts which served words the
 * reply really used. Once per assistant message id per session.
 *
 * Sacred hook contract (matches src/cli.ts: the hook must never break the host
 * session). Every failure path is a silent no-op.
 *
 * The absolute path to src/cli.ts is stamped in at install time by
 * adapters/opencode/install.ts. Runtime detection mirrors scripts/hook.sh:
 * bun preferred, Node >=23 native, Node 22.6+ with --experimental-strip-types,
 * silent no-op if neither runtime is available.
 */

const CLI_PATH = "__LAZY_POLYGLOT_CLI_PATH__"; // replaced at install time

/** Spawn function signature — extracted so tests can inject a counting fake. */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { input: string; encoding: "utf8"; timeout: number; stdio: ["pipe", "pipe", "ignore"] },
) => { error?: unknown; status: number | null; stdout?: string };

const defaultSpawn: SpawnFn = (cmd, args, opts) =>
  spawnSync(cmd, args, opts) as { error?: unknown; status: number | null; stdout?: string };

/** Run `lazy-polyglot hook` with a JSON payload on stdin; "" on any failure. */
function runCliHook(payloadObj: Record<string, unknown>, spawn: SpawnFn): string {
  const payload = JSON.stringify(payloadObj);

  const tryRun = (cmd: string, args: string[]): string | null => {
    const r = spawn(cmd, args, {
      input: payload,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "ignore"],
    });
    if (r.error || r.status !== 0) return null;
    return r.stdout ?? "";
  };

  // bun preferred
  let out = tryRun("bun", [CLI_PATH, "hook"]);
  if (out !== null) return out;

  // node detection: >=23 strips TS natively; 22.6+ needs the flag
  const v = spawn("node", ["-v"], { input: "", encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "ignore"] }).stdout?.trim() ?? "";
  const m = /^v(\d+)\.(\d+)/.exec(v);
  if (m) {
    const major = Number(m[1]);
    const minor = Number(m[2]);
    if (major >= 23) out = tryRun("node", [CLI_PATH, "hook"]);
    else if (major === 22 && minor >= 6) out = tryRun("node", ["--experimental-strip-types", CLI_PATH, "hook"]);
  }
  return out ?? "";
}

function runHook(
  prompt: string,
  sessionId: string,
  spawn: SpawnFn = defaultSpawn,
): string {
  return runCliHook({ prompt, session_id: sessionId, hook_event_name: "UserPromptSubmit" }, spawn);
}

/** Send a finished reply to the CLI (Stop payload). */
function runStop(reply: string, sessionId: string, spawn: SpawnFn): void {
  runCliHook({ hook_event_name: "Stop", session_id: sessionId, last_assistant_message: reply }, spawn);
}

export { runHook };

/**
 * Build the plugin with an optional spawn function (tests inject a fake).
 * Returns the plugin factory expected by opencode's plugin loader.
 */
export function buildPlugin(spawn: SpawnFn = defaultSpawn, fallbackClient?: unknown): Plugin {
  return async (ctx) => {
    // The SDK client comes from the factory arg; several field names below are
    // unverified against opencode, so everything is optional-chained.
    const client: any = (ctx as any)?.client ?? fallbackClient;
    // sessionID → last assistant message id already sent to the CLI.
    const lastReplySent = new Map<string, string>();

    // sessionID → last handled user message id. Long-lived within a session.
    // Keyed by sessionID so parallel/multiple sessions don't collide.
    const lastHandled = new Map<string, string>();

    const hooks: Hooks = {
      "experimental.chat.messages.transform": async (_input, output) => {
        try {
          // find the latest user message's text part
          for (let i = output.messages.length - 1; i >= 0; i--) {
            const entry = output.messages[i];
            if (!entry) continue;
            const { info, parts } = entry;
            if (info.role !== "user") continue;
            const textPart = parts.find((p) => p.type === "text");
            if (!textPart || !("text" in textPart)) continue;

            // turn-scoped dedup: one weave per user message id, regardless of
            // how many agentic tool steps run between user submissions.
            if (lastHandled.get(info.sessionID) === info.id) return;
            // set the marker BEFORE running the hook and BEFORE any empty-block
            // early-return — a "no words due" turn (paused, or all absorbed)
            // would otherwise re-fire on every subsequent agentic step.
            lastHandled.set(info.sessionID, info.id);

            const block = runHook(textPart.text, info.sessionID, spawn);
            if (!block) return; // silent no-op on any failure
            // prepend the lazy-polyglot block to the user's text — model reads it
            // before the user's actual prompt, same position as Claude's hook
            (textPart as { text: string }).text = `${block}\n\n${textPart.text}`;
            return;
          }
        } catch {
          // swallow everything — never break the host session
        }
      },

      event: async (input: { event: any }) => {
        try {
          const event = input?.event;
          if (event?.type !== "session.idle") return;
          const props = event?.properties;
          const id = props?.sessionID ?? props?.sessionId ?? props?.id;
          if (!id || typeof id !== "string") return;
          const fetchMessages = client?.session?.messages;
          if (typeof fetchMessages !== "function") return;
          const res = await fetchMessages.call(client.session, { path: { id } });
          const items: any[] | undefined = Array.isArray(res) ? res : res?.data;
          if (!Array.isArray(items)) return;
          let last: any;
          for (let i = items.length - 1; i >= 0; i--) {
            if (items[i]?.info?.role === "assistant") { last = items[i]; break; }
          }
          if (!last) return;
          const msgId = last?.info?.id;
          if (msgId && lastReplySent.get(id) === msgId) return;
          const parts: any[] = Array.isArray(last?.parts) ? last.parts : [];
          const text = parts
            .filter((p) => p?.type === "text" && typeof p?.text === "string")
            .map((p) => p.text)
            .join("\n")
            .trim();
          if (!text) return;
          // mark before spawning so a slow or failing CLI cannot cause a resend
          if (msgId) lastReplySent.set(id, msgId);
          runStop(text, id, spawn);
        } catch {
          // swallow everything — never break the host session
        }
      },
    } as Hooks;
    return hooks;
  };
}

const plugin: Plugin = buildPlugin();
export default plugin;