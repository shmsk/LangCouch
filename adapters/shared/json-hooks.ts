import { dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Shared writer for CLIs whose hooks live in a Claude-Code-shaped JSON file
 * (`{ hooks: { <Event>: [{ hooks: [{ type, command }] }] } }`): Claude Code's
 * settings.json, Codex's hooks.json and Gemini CLI's settings.json.
 *
 * Used by: adapters/claude, adapters/codex, adapters/gemini.
 */

const HOOK_MARKER = "lazy-polyglot";
// the pre-rename install: a hook command naming langcouch, e.g. `bun …/src/cli.ts hook`
const LEGACY_HOOK = /langcouch.*\bhook\b/i;

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
 * Idempotent: an event that already has our entry is left as is.
 * Upgrades in place: hook entries left by the pre-rename "langcouch" install are
 * removed (a group that held only such an entry goes with it), so the hook never
 * fires twice. Foreign hooks are never touched.
 * Returns the events written (new entry added and/or old one removed; empty = nothing
 * written) and how many old entries were removed.
 */
export function addHooks(
  path: string,
  command: string,
  events: string[] = CLAUDE_EVENTS,
  extra: Omit<HookEntry, "type" | "command"> = {},
): { changed: string[]; replaced: number } {
  const file: HooksFile = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as HooksFile) : {};

  // current = what we'd write now (same command, or any command under the new name), name included
  const isCurrent = (h: HookEntry) =>
    (h.command === command || h.command?.toLowerCase().includes(HOOK_MARKER)) && (extra.name === undefined || h.name === extra.name);
  const isLegacy = (h: HookEntry) => !isCurrent(h) && LEGACY_HOOK.test(h.command ?? "");

  file.hooks ??= {};
  const changed: string[] = [];
  let replaced = 0;
  for (const event of events) {
    file.hooks[event] ??= [];
    let touched = false;

    const groups: HookGroup[] = [];
    for (const g of file.hooks[event]) {
      const legacy = Array.isArray(g.hooks) ? g.hooks.filter(isLegacy) : [];
      if (legacy.length === 0) {
        groups.push(g);
        continue;
      }
      replaced += legacy.length;
      touched = true;
      const kept = g.hooks.filter((h) => !isLegacy(h));
      if (kept.length > 0) groups.push({ ...g, hooks: kept });
    }
    file.hooks[event] = groups;

    if (!groups.some((g) => g.hooks?.some(isCurrent))) {
      groups.push({ hooks: [{ type: "command", command, ...extra }] });
      touched = true;
    }
    if (touched) changed.push(event);
  }

  if (changed.length === 0) return { changed, replaced };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2));
  return { changed, replaced };
}
