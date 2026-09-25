import { dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Shared writer for CLIs whose hooks live in a Claude-Code-shaped JSON file
 * (`{ hooks: { <Event>: [{ hooks: [{ type, command }] }] } }`): Claude Code's
 * settings.json and Codex's hooks.json.
 *
 * Used by: adapters/claude, adapters/codex.
 */

const HOOK_MARKER = "langcouch";

// UserPromptSubmit is the workhorse (fresh words every prompt); SessionStart is the
// fallback for CLI versions where prompt-submit context injection is flaky (lang-coach lesson).
const EVENTS = ["UserPromptSubmit", "SessionStart"];

interface HookEntry {
  type: "command";
  command: string;
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
export function addHooks(path: string, command: string): string[] {
  const file: HooksFile = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as HooksFile) : {};

  file.hooks ??= {};
  const added: string[] = [];
  for (const event of EVENTS) {
    file.hooks[event] ??= [];
    const groups = file.hooks[event];
    const already = groups.some((g) => g.hooks?.some((h) => h.command?.toLowerCase().includes(HOOK_MARKER)));
    if (already) continue;
    groups.push({ hooks: [{ type: "command", command }] });
    added.push(event);
  }

  if (added.length === 0) return added;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2));
  return added;
}
