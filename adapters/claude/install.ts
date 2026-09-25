import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const HOOK_MARKER = "langcouch";

interface HookEntry {
  type: "command";
  command: string;
}
interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}
interface Settings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

function cliPath(): string {
  return join(dirname(new URL(import.meta.url).pathname), "..", "..", "src", "cli.ts");
}

/**
 * Register the UserPromptSubmit hook in Claude Code settings.
 * scope=project → ./.claude/settings.json (safe default for trying things out)
 * scope=user    → ~/.claude/settings.json (every session everywhere)
 * Idempotent: an existing langcouch entry is left as is.
 */
/** Best-effort check: is the langcouch plugin already installed in Claude Code? */
function pluginAlreadyInstalled(): boolean {
  try {
    const raw = readFileSync(join(homedir(), ".claude", "plugins", "installed_plugins.json"), "utf8");
    return raw.includes('"langcouch@');
  } catch {
    return false;
  }
}

export function installClaude(scope: "project" | "user"): string {
  const settingsPath =
    scope === "user"
      ? join(homedir(), ".claude", "settings.json")
      : join(process.cwd(), ".claude", "settings.json");

  const pluginWarning = pluginAlreadyInstalled()
    ? "\nNote: the langcouch Claude Code plugin is already installed — it provides this hook by itself. A duplicate-delivery guard prevents double counting, but you likely don't need this manual install."
    : "";

  const settings: Settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, "utf8")) as Settings)
    : {};

  settings.hooks ??= {};
  const command = `bun ${cliPath()} hook`;
  // UserPromptSubmit is the workhorse (fresh words every prompt); SessionStart is the
  // fallback for CLI versions where prompt-submit context injection is flaky (lang-coach lesson).
  const added: string[] = [];
  for (const event of ["UserPromptSubmit", "SessionStart"]) {
    settings.hooks[event] ??= [];
    const groups = settings.hooks[event];
    const already = groups.some((g) => g.hooks?.some((h) => h.command?.toLowerCase().includes(HOOK_MARKER)));
    if (already) continue;
    groups.push({ hooks: [{ type: "command", command }] });
    added.push(event);
  }

  if (added.length === 0) return `langcouch hook already installed in ${settingsPath} — leaving it alone${pluginWarning}`;

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return `Hook installed (${added.join(" + ")}): ${settingsPath}\nRestart your Claude Code session ${scope === "project" ? "in this project" : "anywhere"} — replies will start weaving words.${pluginWarning}`;
}
