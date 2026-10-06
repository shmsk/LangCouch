import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { writeAgentsSection } from "../shared/agents-section.ts";
import { cliPath, stampCliPath, ownershipAction } from "../shared/stamp.ts";

export { stampCliPath };

const PLUGIN_MARKER = "/* lazy-polyglot */";
// the pre-rename plugin file: langcouch.ts in the same directory, marked "/* langcouch */"
const LEGACY_FILE = "langcouch.ts";
const LEGACY_MARKER = "/* langcouch */";

/**
 * Resolve the user's home directory for the global opencode plugin path.
 * `os.homedir()` ignores $HOME on some platforms (uses getpwuid); we honor
 * $HOME first so the behavior is predictable and testable, falling back to
 * os.homedir() when $HOME is unset.
 */
function userHome(): string {
  return process.env.HOME || homedir();
}

function pluginTemplate(): string {
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "plugin.template.ts"), "utf8");
  return stampCliPath(raw, cliPath());
}

/**
 * Install the opencode adapter. Two paths, both installed by one command:
 *
 * 1. Plugin (primary, reliable): a .ts file auto-discovered by opencode under
 *    .opencode/plugin/ (project) or ~/.config/opencode/plugin/ (user). Hooks
 *    experimental.chat.messages.transform to run `lazy-polyglot hook` on the latest
 *    user message and inject the <lazy-polyglot> block into context.
 * 2. AGENTS.md section (fallback, experimental): same self-serve pattern as the
 *    Codex adapter — instructs the model to run `lazy-polyglot hook` itself at the
 *    start of each reply. Works even if the user disables plugins, but model
 *    compliance varies.
 *
 * The duplicate-delivery guard in src/guard.ts dedupes identical payloads
 * within 5s, so if both paths fire for the same prompt, the second is a no-op.
 *
 * Idempotent: re-running refreshes both files in place without duplicating.
 * An old LangCouch install is upgraded: its langcouch.ts plugin file is deleted
 * (only if it carries our marker) and its AGENTS.md section becomes the new one.
 */
export function installOpencode(scope: "project" | "user"): string {
  const pluginDir =
    scope === "user"
      ? join(userHome(), ".config", "opencode", "plugin")
      : join(process.cwd(), ".opencode", "plugin");
  const pluginPath = join(pluginDir, "lazy-polyglot.ts");

  const legacyPath = join(pluginDir, LEGACY_FILE);
  const legacyInstalled = existsSync(legacyPath) && readFileSync(legacyPath, "utf8").includes(LEGACY_MARKER);

  // refresh-in-place: marker comment lets us detect an existing install
  const existing = existsSync(pluginPath) ? readFileSync(pluginPath, "utf8") : "";
  const pluginAction = ownershipAction(existing, PLUGIN_MARKER, pluginPath);

  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(pluginPath, pluginTemplate());
  if (legacyInstalled) rmSync(legacyPath);

  // AGENTS.md fallback — lives in the project root regardless of plugin scope
  // (the model reads AGENTS.md from the cwd; a global plugin still needs a
  // project-level AGENTS.md section to trigger self-serve when the plugin is
  // disabled).
  const agentsPath = join(process.cwd(), "AGENTS.md");
  const agentsAction = writeAgentsSection(agentsPath, cliPath());

  const lines = [
    `Plugin ${pluginAction} at ${pluginPath}`,
    `AGENTS.md section ${agentsAction} at ${agentsPath}`,
    ...(legacyInstalled ? [`Removed the old langcouch plugin ${legacyPath}.`] : []),
    ``,
    `Primary path (reliable): the plugin hooks experimental.chat.messages.transform — runs \`lazy-polyglot hook\` on every user message and injects the <lazy-polyglot> block into context.`,
    `Fallback path (experimental): the AGENTS.md section tells the model to run \`lazy-polyglot hook\` itself — works even if plugins are disabled, but model compliance varies.`,
    ``,
    `Quit and restart opencode to load the plugin${scope === "user" ? " (it will be active in every project)" : " (active in this project)"}.`,
  ];
  return lines.join("\n");
}