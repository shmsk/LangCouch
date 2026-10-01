import { dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Shared writer for CLIs whose hooks live in a Claude-Code-shaped JSON file
 * (`{ hooks: { <Event>: [{ hooks: [{ type, command }] }] } }`): Claude Code's
 * settings.json, Codex's hooks.json and Gemini CLI's settings.json.
 *
 * Used by: adapters/claude, adapters/codex, adapters/gemini.
 */

const HOOK_MARKER = "langcouch";

// UserPromptSubmit is the workhorse (fresh words every prompt); SessionStart is the
// fallback for CLI versions where prompt-submit context injection is flaky (lang-coach lesson).
// Stop reads the finished reply back, so only words it actually used count (weave algorithm 3).
export const CLAUDE_EVENTS = ["UserPromptSubmit", "SessionStart", "Stop"];

interface HookEntry {
  type: "command";
  command: string;
  /** Gemini CLI only: shown in /hooks and part of the trust fingerprint */
  name?: string;
  /** Gemini CLI only: milliseconds */
  timeout?: number;
}
interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}
interface HooksFile {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

/**
 * Register `command` for every event in `path`, keeping everything else in the file.
 * Idempotent: an event that already has a langcouch entry is left as is.
 * Returns the events actually added (empty = nothing written).
 */
export function addHooks(path: string, command: string, events: string[] = CLAUDE_EVENTS, extra: Omit<HookEntry, "type" | "command"> = {}): string[] {
  const file: HooksFile = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as HooksFile) : {};

  file.hooks ??= {};
  const added: string[] = [];
  for (const event of events) {
    file.hooks[event] ??= [];
    const groups = file.hooks[event];
    const already = groups.some((g) => g.hooks?.some((h) => h.command?.toLowerCase().includes(HOOK_MARKER)));
    if (already) continue;
    groups.push({ hooks: [{ type: "command", command, ...extra }] });
    added.push(event);
  }

  if (added.length === 0) return added;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2));
  return added;
}
