import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { cliPath, packageVersion, stampCliPath, ownershipAction } from "../shared/stamp.ts";

const PLUGIN_MARKER = "# lazy-polyglot";
// the pre-rename plugin: directory plugins/langcouch, files marked "# langcouch"
const LEGACY_NAME = "langcouch";
const LEGACY_MARKER = "# langcouch";

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
    "name: lazy-polyglot",
    `version: ${packageVersion()}`,
    "description: Learn a language while you work (diglot weave in agent replies)",
    "author: Kirill Shumskii",
    "provides_hooks:",
    "  - pre_llm_call",
    "",
  ].join("\n");
}

/** Delete the pre-rename plugin's own files from `dir`; returns `dir` if anything was removed. */
function removeLegacy(dir: string): string | undefined {
  let removed = false;
  for (const file of ["__init__.py", "plugin.yaml"]) {
    const p = join(dir, file);
    if (existsSync(p) && readFileSync(p, "utf8").includes(LEGACY_MARKER)) {
      rmSync(p);
      removed = true;
    }
  }
  if (removed && readdirSync(dir).every((f) => f === "__pycache__")) rmSync(dir, { recursive: true });
  return removed ? dir : undefined;
}

/**
 * Install the Hermes Agent adapter: a directory plugin under
 * $HERMES_HOME/plugins/lazy-polyglot/ (plugin.yaml + __init__.py). The Python file
 * only shells out to `lazy-polyglot hook`; all logic stays in the TypeScript CLI.
 *
 * Hermes plugins are opt-in, so the user still runs `hermes plugins enable`.
 * Idempotent: re-running refreshes both files in place; a foreign file at
 * either path is never overwritten. An old plugins/langcouch/ install is
 * removed (only its own two files, and the directory if that leaves it empty),
 * so the hook doesn't fire twice.
 */
export function installHermes(): string {
  const dir = join(hermesHome(), "plugins", "lazy-polyglot");
  const initPath = join(dir, "__init__.py");
  const yamlPath = join(dir, "plugin.yaml");

  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  const action = ownershipAction(read(initPath), PLUGIN_MARKER, initPath);
  ownershipAction(read(yamlPath), PLUGIN_MARKER, yamlPath);

  const replacedLegacy = removeLegacy(join(hermesHome(), "plugins", LEGACY_NAME));

  mkdirSync(dir, { recursive: true });
  writeFileSync(initPath, pluginSource());
  writeFileSync(yamlPath, manifest());

  return [
    `Plugin ${action} at ${dir}`,
    ...(replacedLegacy
      ? [`Removed the old langcouch plugin at ${replacedLegacy}. Hermes keeps its enabled list in config.yaml: run \`hermes plugins disable ${LEGACY_NAME}\` if it still lists it.`]
      : []),
    ``,
    `Hermes plugins are opt-in. Enable it and restart Hermes:`,
    `  hermes plugins enable lazy-polyglot`,
    ``,
    `Check it loaded (should list the pre_llm_call hook and the /lazy-polyglot command):`,
    `  HERMES_PLUGINS_DEBUG=1 hermes plugins list`,
    ``,
    `In a session: /lazy-polyglot status, /lazy-polyglot lang es, /lazy-polyglot pause.`,
  ].join("\n");
}
