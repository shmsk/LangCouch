import { spawnSync } from "node:child_process";
import type { Plugin, Hooks } from "@opencode-ai/plugin";

/* langcouch */

/**
 * LangCouch adapter for opencode.
 *
 * Primary path: this plugin is auto-discovered by opencode (any *.ts under
 * .opencode/plugin/ or ~/.config/opencode/plugin/). On every chat turn it
 * shells out to `langcouch hook`, feeds the latest user message as the prompt
 * payload, and prepends the emitted <langcouch>…</langcouch> block to that
 * user message's text — same context-injection contract as the Claude Code
 * UserPromptSubmit hook.
 *
 * Turn-scoped dedup: opencode's `experimental.chat.messages.transform` fires
 * inside the agentic tool-call loop, not once per user submission. Without
 * dedup, a turn that loops through N tool steps would run `langcouch hook`
 * and mark exposures N times — corrupting the SRS counts the tool exists to
 * keep honest. We key on `info.id` (the user-message id) within a session and
 * only handle a given user turn once.
 *
 * Sacred hook contract (matches src/cli.ts: the hook must never break the host
 * session). Every failure path is a silent no-op.
 *
 * The absolute path to src/cli.ts is stamped in at install time by
 * adapters/opencode/install.ts. Runtime detection mirrors scripts/hook.sh:
 * bun preferred, Node >=23 native, Node 22.6+ with --experimental-strip-types,
 * silent no-op if neither runtime is available.
 */

const CLI_PATH = "__LANGCOUCH_CLI_PATH__"; // replaced at install time

/** Spawn function signature — extracted so tests can inject a counting fake. */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { input: string; encoding: "utf8"; timeout: number; stdio: ["pipe", "pipe", "ignore"] },
) => { error?: unknown; status: number | null; stdout?: string };

const defaultSpawn: SpawnFn = (cmd, args, opts) =>
  spawnSync(cmd, args, opts) as { error?: unknown; status: number | null; stdout?: string };

function runHook(
  prompt: string,
  sessionId: string,
  spawn: SpawnFn = defaultSpawn,
): string {
  const payload = JSON.stringify({
    prompt,
    session_id: sessionId,
    hook_event_name: "UserPromptSubmit",
  });

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

export { runHook };

/**
 * Build the plugin with an optional spawn function (tests inject a fake).
 * Returns the plugin factory expected by opencode's plugin loader.
 */
export function buildPlugin(spawn: SpawnFn = defaultSpawn): Plugin {
  return async () => {
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
            // prepend the langcouch block to the user's text — model reads it
            // before the user's actual prompt, same position as Claude's hook
            (textPart as { text: string }).text = `${block}\n\n${textPart.text}`;
            return;
          }
        } catch {
          // swallow everything — never break the host session
        }
      },
    };
    return hooks;
  };
}

const plugin: Plugin = buildPlugin();
export default plugin;