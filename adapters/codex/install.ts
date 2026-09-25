import { join, dirname } from "node:path";
import { writeAgentsSection } from "../shared/agents-section.ts";

function cliPath(): string {
  return join(dirname(new URL(import.meta.url).pathname), "..", "..", "src", "cli.ts");
}

/**
 * EXPERIMENTAL: Codex CLI has no context-injection hooks, so the adapter is a
 * self-serve AGENTS.md section — the agent itself runs `langcouch hook` and
 * follows the emitted instruction. Idempotent via marker comments; re-running
 * refreshes the section in place.
 */
export function installCodex(): string {
  const agentsPath = join(process.cwd(), "AGENTS.md");
  const action = writeAgentsSection(agentsPath, cliPath());
  return `langcouch section ${action} in ${agentsPath} (experimental: Codex runs the hook itself at the start of each reply).`;
}