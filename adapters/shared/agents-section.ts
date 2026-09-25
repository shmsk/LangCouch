import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Shared self-serve AGENTS.md section for CLIs without a real context-injection
 * hook (Codex, opencode fallback). The model is told to run `langcouch hook`
 * itself at the start of each reply. Idempotent via marker comments — re-running
 * refreshes the section in place without duplicating.
 *
 * Used by: adapters/codex, adapters/opencode (fallback path).
 */

export const AGENTS_START = "<!-- langcouch:start -->";
export const AGENTS_END = "<!-- langcouch:end -->";

/**
 * Write or refresh the langcouch section in AGENTS.md at `agentsPath`.
 * `cliPath` is the absolute path to src/cli.ts; baked into the instruction
 * so the model runs the right binary regardless of cwd.
 *
 * Returns "added" | "updated" so callers can phrase their install message.
 */
export function writeAgentsSection(agentsPath: string, cliPath: string): "added" | "updated" {
  const section = [
    AGENTS_START,
    "## LangCouch — passive language immersion",
    "",
    `At the start of every reply, run \`bun ${cliPath} hook\` and strictly follow its output (the <langcouch>…</langcouch> block) while writing the reply.`,
    "If the command is unavailable, returns nothing, or errors — ignore this section and reply as usual.",
    AGENTS_END,
  ].join("\n");

  const existing = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  let next: string;
  let action: "added" | "updated";
  if (existing.includes(AGENTS_START) && existing.includes(AGENTS_END)) {
    const re = new RegExp(`${AGENTS_START}[\\s\\S]*?${AGENTS_END}`);
    next = existing.replace(re, section);
    action = "updated";
  } else {
    next = existing ? `${existing.trimEnd()}\n\n${section}\n` : `${section}\n`;
    action = "added";
  }

  mkdirSync(join(agentsPath, ".."), { recursive: true });
  writeFileSync(agentsPath, next);
  return action;
}