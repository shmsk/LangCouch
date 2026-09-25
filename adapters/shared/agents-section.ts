import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

/**
 * Shared self-serve AGENTS.md section for CLIs without a real context-injection
 * hook (opencode fallback). The model is told to run `langcouch hook`
 * itself at the start of each reply. Idempotent via marker comments — re-running
 * refreshes the section in place without duplicating.
 *
 * Used by: adapters/opencode (fallback path). adapters/codex only removes it (it now has a real hook).
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
/**
 * Remove the langcouch section from AGENTS.md, e.g. when a CLI gains a real hook
 * and the self-serve path would double-deliver. Deletes the file if nothing else is left.
 * Returns true if a section was removed.
 */
export function removeAgentsSection(agentsPath: string): boolean {
  if (!existsSync(agentsPath)) return false;
  const existing = readFileSync(agentsPath, "utf8");
  if (!existing.includes(AGENTS_START) || !existing.includes(AGENTS_END)) return false;
  const re = new RegExp(`\\n*${AGENTS_START}[\\s\\S]*?${AGENTS_END}\\n*`);
  const next = existing.replace(re, "\n\n").trim();
  if (next) writeFileSync(agentsPath, `${next}\n`);
  else rmSync(agentsPath);
  return true;
}
