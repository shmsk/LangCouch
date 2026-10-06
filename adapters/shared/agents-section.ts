import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

/**
 * Shared self-serve AGENTS.md section for CLIs without a real context-injection
 * hook (opencode fallback). The model is told to run `lazy-polyglot hook`
 * itself at the start of each reply. Idempotent via marker comments — re-running
 * refreshes the section in place without duplicating.
 *
 * Used by: adapters/opencode (fallback path). adapters/codex only removes it (it now has a real hook).
 */

export const AGENTS_START = "<!-- lazy-polyglot:start -->";
export const AGENTS_END = "<!-- lazy-polyglot:end -->";

/** Markers of the pre-rename (LangCouch) section; found and replaced or removed on upgrade. */
export const LEGACY_AGENTS_START = "<!-- langcouch:start -->";
export const LEGACY_AGENTS_END = "<!-- langcouch:end -->";

const blockRe = (start: string, end: string, pad = "") => new RegExp(`${pad}${start}[\\s\\S]*?${end}${pad}`);

/**
 * Write or refresh the lazy-polyglot section in AGENTS.md at `agentsPath`.
 * `cliPath` is the absolute path to src/cli.ts; baked into the instruction
 * so the model runs the right binary regardless of cwd.
 *
 * Returns "added" | "updated" so callers can phrase their install message.
 */
export function writeAgentsSection(agentsPath: string, cliPath: string): "added" | "updated" {
  const section = [
    AGENTS_START,
    "## Lazy Polyglot — passive language immersion",
    "",
    `At the start of every reply, run \`bun ${cliPath} hook\` and strictly follow its output (the <lazy-polyglot>…</lazy-polyglot> block) while writing the reply.`,
    "If the command is unavailable, returns nothing, or errors — ignore this section and reply as usual.",
    AGENTS_END,
  ].join("\n");

  let text = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  const has = (start: string, end: string) => text.includes(start) && text.includes(end);
  const hadSection = has(AGENTS_START, AGENTS_END) || has(LEGACY_AGENTS_START, LEGACY_AGENTS_END);

  // an old LangCouch section turns into the new one in place; a second copy next to a new one is dropped
  if (has(LEGACY_AGENTS_START, LEGACY_AGENTS_END)) {
    text = text.replace(blockRe(LEGACY_AGENTS_START, LEGACY_AGENTS_END), () => (has(AGENTS_START, AGENTS_END) ? "" : section));
  }

  let next: string;
  if (has(AGENTS_START, AGENTS_END)) next = text.replace(blockRe(AGENTS_START, AGENTS_END), () => section);
  else next = text ? `${text.trimEnd()}\n\n${section}\n` : `${section}\n`;
  const action = hadSection ? "updated" : "added";

  mkdirSync(join(agentsPath, ".."), { recursive: true });
  writeFileSync(agentsPath, next);
  return action;
}
/**
 * Remove the lazy-polyglot section (and the pre-rename langcouch one) from AGENTS.md, e.g.
 * when a CLI gains a real hook and the self-serve path would double-deliver. Deletes the
 * file if nothing else is left. Returns true if a section was removed.
 */
export function removeAgentsSection(agentsPath: string): boolean {
  if (!existsSync(agentsPath)) return false;
  let text = readFileSync(agentsPath, "utf8");
  let removed = false;
  for (const [start, end] of [
    [AGENTS_START, AGENTS_END],
    [LEGACY_AGENTS_START, LEGACY_AGENTS_END],
  ] as const) {
    if (!text.includes(start) || !text.includes(end)) continue;
    text = text.replace(blockRe(start, end, "\\n*"), "\n\n");
    removed = true;
  }
  if (!removed) return false;
  const next = text.trim();
  if (next) writeFileSync(agentsPath, `${next}\n`);
  else rmSync(agentsPath);
  return true;
}
