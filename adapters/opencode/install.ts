import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { writeAgentsSection } from "../shared/agents-section.ts";

const PLUGIN_MARKER = "/* langcouch */";

function cliPath(): string {
  return join(dirname(new URL(import.meta.url).pathname), "..", "..", "src", "cli.ts");
}

/**
 * Resolve the user's home directory for the global opencode plugin path.
 * `os.homedir()` ignores $HOME on some platforms (uses getpwuid); we honor
 * $HOME first so the behavior is predictable and testable, falling back to
 * os.homedir() when $HOME is unset.
 */
function userHome(): string {
  return process.env.HOME || homedir();
}

const PLACEHOLDER = '"__LANGCOUCH_CLI_PATH__"';

/**
 * Stamp the absolute CLI path into the plugin template.
 * Pure function — extracted for testability. Uses a function replacer so `$`
 * characters in the path (e.g. `$HOME`, `$&`) are not interpreted as
 * String.replace pattern variables.
 */
export function stampCliPath(template: string, cliPath: string): string {
  return template.replace(PLACEHOLDER, () => JSON.stringify(cliPath));
}

function pluginTemplate(): string {
  const raw = readFileSync(join(dirname(new URL(import.meta.url).pathname), "plugin.template.ts"), "utf8");
  return stampCliPath(raw, cliPath());
}

/**
 * Install the opencode adapter. Two paths, both installed by one command:
 *
 * 1. Plugin (primary, reliable): a .ts file auto-discovered by opencode under
 *    .opencode/plugin/ (project) or ~/.config/opencode/plugin/ (user). Hooks
 *    experimental.chat.messages.transform to run `langcouch hook` on the latest
 *    user message and inject the <langcouch> block into context.
 * 2. AGENTS.md section (fallback, experimental): same self-serve pattern as the
 *    Codex adapter — instructs the model to run `langcouch hook` itself at the
 *    start of each reply. Works even if the user disables plugins, but model
 *    compliance varies.
 *
 * The duplicate-delivery guard in src/guard.ts dedupes identical payloads
 * within 5s, so if both paths fire for the same prompt, the second is a no-op.
 *
 * Idempotent: re-running refreshes both files in place without duplicating.
 */
export function installOpencode(scope: "project" | "user"): string {
  const pluginDir =
    scope === "user"
      ? join(userHome(), ".config", "opencode", "plugin")
      : join(process.cwd(), ".opencode", "plugin");
  const pluginPath = join(pluginDir, "langcouch.ts");

  // refresh-in-place: marker comment lets us detect an existing install
  let pluginAction: "added" | "updated";
  const existing = existsSync(pluginPath) ? readFileSync(pluginPath, "utf8") : "";
  if (existing.includes(PLUGIN_MARKER)) {
    pluginAction = "updated";
  } else if (existing) {
    // file exists but isn't ours — don't clobber, pick a non-colliding name
    throw new Error(`langcouch: ${pluginPath} already exists and isn't ours — move it aside and re-run`);
  } else {
    pluginAction = "added";
  }

  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(pluginPath, pluginTemplate());

  // AGENTS.md fallback — lives in the project root regardless of plugin scope
  // (the model reads AGENTS.md from the cwd; a global plugin still needs a
  // project-level AGENTS.md section to trigger self-serve when the plugin is
  // disabled).
  const agentsPath = join(process.cwd(), "AGENTS.md");
  const agentsAction = writeAgentsSection(agentsPath, cliPath());

  const lines = [
    `Plugin ${pluginAction} at ${pluginPath}`,
    `AGENTS.md section ${agentsAction} at ${agentsPath}`,
    ``,
    `Primary path (reliable): the plugin hooks experimental.chat.messages.transform — runs \`langcouch hook\` on every user message and injects the <langcouch> block into context.`,
    `Fallback path (experimental): the AGENTS.md section tells the model to run \`langcouch hook\` itself — works even if plugins are disabled, but model compliance varies.`,
    ``,
    `Quit and restart opencode to load the plugin${scope === "user" ? " (it will be active in every project)" : " (active in this project)"}.`,
  ];
  return lines.join("\n");
}