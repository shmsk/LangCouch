import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cliPath, packageVersion, stampCliPath, ownershipAction } from "../shared/stamp.ts";

const PLUGIN_MARKER = "# langcouch";

/** $HERMES_HOME, default ~/.hermes. $HOME first, like the opencode adapter. */
export function hermesHome(): string {
  return process.env.HERMES_HOME || join(process.env.HOME || homedir(), ".hermes");
}

function pluginSource(): string {
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "plugin.template.py"), "utf8");
  return stampCliPath(raw, cliPath());
}

function manifest(): string {
  return [
    PLUGIN_MARKER,
    "name: langcouch",
    `version: ${packageVersion()}`,
    "description: Learn a language while you work (diglot weave in agent replies)",
    "author: Kirill Shumskii",
    "provides_hooks:",
    "  - pre_llm_call",
    "",
  ].join("\n");
}

/**
 * Install the Hermes Agent adapter: a directory plugin under
 * $HERMES_HOME/plugins/langcouch/ (plugin.yaml + __init__.py). The Python file
 * only shells out to `langcouch hook`; all logic stays in the TypeScript CLI.
 *
 * Hermes plugins are opt-in, so the user still runs `hermes plugins enable`.
 * Idempotent: re-running refreshes both files in place; a foreign file at
 * either path is never overwritten.
 */
export function installHermes(): string {
  const dir = join(hermesHome(), "plugins", "langcouch");
  const initPath = join(dir, "__init__.py");
  const yamlPath = join(dir, "plugin.yaml");

  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  const action = ownershipAction(read(initPath), PLUGIN_MARKER, initPath);
  ownershipAction(read(yamlPath), PLUGIN_MARKER, yamlPath);

  mkdirSync(dir, { recursive: true });
  writeFileSync(initPath, pluginSource());
  writeFileSync(yamlPath, manifest());

  return [
    `Plugin ${action} at ${dir}`,
    ``,
    `Hermes plugins are opt-in. Enable it and restart Hermes:`,
    `  hermes plugins enable langcouch`,
    ``,
    `Check it loaded (should list the pre_llm_call hook and the /langcouch command):`,
    `  HERMES_PLUGINS_DEBUG=1 hermes plugins list`,
    ``,
    `In a session: /langcouch status, /langcouch lang es, /langcouch pause.`,
  ].join("\n");
}
