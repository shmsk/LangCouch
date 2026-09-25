import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import type { State, Word } from "./types.ts";
import { glossFor, isAbsorbed } from "./types.ts";

/**
 * Spinner tips: while Claude Code thinks, its spinner rotates `spinnerTipsOverride.tips`.
 * A plugin can't ship that key and has no uninstall hook, so we edit the user's
 * settings.json surgically: every line we add starts with SPINNER_MARKER, and removal
 * is by that prefix — never by a stored list, so it works even if ~/.langcouch is gone.
 * Nothing else in the file is touched.
 */
export const SPINNER_MARKER = "LangCouch · ";
export const SPINNER_TIPS = 5;

type Settings = Record<string, unknown>;
interface TipsOverride {
  tips?: unknown[];
  [key: string]: unknown;
}

/** Claude Code user settings; LANGCOUCH_CLAUDE_SETTINGS overrides (tests), CLAUDE_CONFIG_DIR is honoured. */
export function claudeSettingsPath(): string {
  if (process.env.LANGCOUCH_CLAUDE_SETTINGS) return process.env.LANGCOUCH_CLAUDE_SETTINGS;
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

const isOurs = (t: unknown) => typeof t === "string" && t.startsWith(SPINNER_MARKER);

/** Words worth reviewing: in progress and not yet absorbed, most recently shown first. */
export function pickSpinnerWords(words: Word[], state: State, n = SPINNER_TIPS): Word[] {
  return words
    .filter((w) => (state[w.id]?.exposures ?? 0) > 0 && !isAbsorbed(state[w.id]))
    .sort((a, b) => (state[b.id]?.lastSeen ?? "").localeCompare(state[a.id]?.lastSeen ?? ""))
    .slice(0, n);
}

export const tipFor = (w: Word, native: string) => `${SPINNER_MARKER}${w.target} = ${glossFor(w, native)}`;

/** Replace our tips with `tips`, keeping every foreign tip and key. Returns a new object. */
export function applySpinnerTips(settings: Settings, tips: string[]): Settings {
  const cleaned = removeSpinnerTips(settings);
  if (tips.length === 0) return cleaned;
  const prev = (cleaned.spinnerTipsOverride ?? {}) as TipsOverride;
  const foreign = Array.isArray(prev.tips) ? prev.tips : [];
  return { ...cleaned, spinnerTipsOverride: { ...prev, tips: [...foreign, ...tips] } };
}

/** Drop every marker-tagged tip; if that leaves a bare `{ tips: [] }`, drop the key too. */
export function removeSpinnerTips(settings: Settings): Settings {
  const prev = settings.spinnerTipsOverride as TipsOverride | undefined;
  if (!prev || typeof prev !== "object" || !Array.isArray(prev.tips) || !prev.tips.some(isOurs)) return settings;
  const tips = prev.tips.filter((t) => !isOurs(t));
  const next: Settings = { ...settings };
  const onlyTips = Object.keys(prev).every((k) => k === "tips");
  if (tips.length === 0 && onlyTips) delete next.spinnerTipsOverride;
  else next.spinnerTipsOverride = { ...prev, tips };
  return next;
}

export const countOurTips = (settings: Settings): number => {
  const tips = (settings.spinnerTipsOverride as TipsOverride | undefined)?.tips;
  return Array.isArray(tips) ? tips.filter(isOurs).length : 0;
};

/** Parse settings; a missing file is `{}`, anything that isn't a JSON object throws (and we write nothing). */
export function readSettings(path = claudeSettingsPath()): Settings {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  if (raw.trim() === "") return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`langcouch: ${path} is not a JSON object — leaving it alone`);
  }
  return parsed as Settings;
}

/**
 * Write only when the content changes (Claude Code watches this file), atomically
 * (tmp + rename), with a one-time backup of the original next to our own data.
 * Returns true if the file was written.
 */
export function writeSettingsIfChanged(before: Settings, after: Settings, backupDir: string, path = claudeSettingsPath()): boolean {
  if (JSON.stringify(before) === JSON.stringify(after)) return false;
  const backup = join(backupDir, "settings.backup.json");
  if (existsSync(path) && !existsSync(backup)) {
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(backup, readFileSync(path, "utf8"));
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.langcouch.tmp`;
  writeFileSync(tmp, JSON.stringify(after, null, 2) + "\n");
  renameSync(tmp, path);
  return true;
}
