import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { addHooks } from "../shared/json-hooks.ts";

function cliPath(): string {
  return join(dirname(new URL(import.meta.url).pathname), "..", "..", "src", "cli.ts");
}

/** Best-effort check: is the langcouch plugin already installed in Claude Code? */
function pluginAlreadyInstalled(): boolean {
  try {
    const raw = readFileSync(join(homedir(), ".claude", "plugins", "installed_plugins.json"), "utf8");
    return raw.includes('"langcouch@');
  } catch {
    return false;
  }
}

/**
 * Register the UserPromptSubmit hook in Claude Code settings.
 * scope=project → ./.claude/settings.json (safe default for trying things out)
 * scope=user    → ~/.claude/settings.json (every session everywhere)
 * Idempotent: an existing langcouch entry is left as is.
 */
export function installClaude(scope: "project" | "user"): string {
  const settingsPath =
    scope === "user"
      ? join(homedir(), ".claude", "settings.json")
      : join(process.cwd(), ".claude", "settings.json");

  const pluginWarning = pluginAlreadyInstalled()
    ? "\nNote: the langcouch Claude Code plugin is already installed — it provides this hook by itself. A duplicate-delivery guard prevents double counting, but you likely don't need this manual install."
    : "";

  const added = addHooks(settingsPath, `bun ${cliPath()} hook`);

  if (added.length === 0) return `langcouch hook already installed in ${settingsPath} — leaving it alone${pluginWarning}`;
  return `Hook installed (${added.join(" + ")}): ${settingsPath}\nRestart your Claude Code session ${scope === "project" ? "in this project" : "anywhere"} — replies will start weaving words.${pluginWarning}`;
}
