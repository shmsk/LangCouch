import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { addHooks } from "../shared/json-hooks.ts";
import { removeAgentsSection } from "../shared/agents-section.ts";

function cliPath(): string {
  return join(dirname(new URL(import.meta.url).pathname), "..", "..", "src", "cli.ts");
}

/**
 * Register the UserPromptSubmit hook in Codex CLI's hooks.json. Codex hooks use the
 * same file shape and stdin payload as Claude Code, and plain stdout is added as
 * developer context, so `langcouch hook` works unchanged.
 * scope=project → ./.codex/hooks.json (Codex loads it only in a trusted project)
 * scope=user    → $CODEX_HOME/hooks.json, default ~/.codex/hooks.json
 * Also removes the old self-serve AGENTS.md section from earlier installs, which
 * would otherwise make the model run the hook a second time.
 */
export function installCodex(scope: "project" | "user"): string {
  const hooksPath =
    scope === "user"
      ? join(process.env.CODEX_HOME || join(homedir(), ".codex"), "hooks.json")
      : join(process.cwd(), ".codex", "hooks.json");

  const added = addHooks(hooksPath, `bun ${cliPath()} hook`);
  const agentsPath = join(process.cwd(), "AGENTS.md");
  const migrated = removeAgentsSection(agentsPath)
    ? `\nRemoved the old self-serve langcouch section from ${agentsPath}.`
    : "";

  if (added.length === 0) return `langcouch hook already installed in ${hooksPath} — leaving it alone${migrated}`;
  return [
    `Hook installed (${added.join(" + ")}): ${hooksPath}${migrated}`,
    `Codex skips hooks it hasn't reviewed: start Codex, open /hooks and trust the langcouch hook${scope === "project" ? " (the project itself must be trusted too)" : ""}.`,
    "Then replies will start weaving words.",
  ].join("\n");
}
