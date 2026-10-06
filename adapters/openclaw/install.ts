import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { DATA_DIR } from "../../src/store.ts";
import { cliPath, packageVersion, stampCliPath, ownershipAction } from "../shared/stamp.ts";

const PLUGIN_MARKER = "/* lazy-polyglot */";
// the pre-rename plugin: generated into <data dir>/openclaw-plugin, id "langcouch"
const LEGACY_MARKER = "/* langcouch */";

/** Where the pre-rename install generated its plugin: $LANGCOUCH_DIR or ~/.langcouch. */
function legacyPluginDir(): string {
  return join(process.env.LANGCOUCH_DIR || join(process.env.HOME || homedir(), ".langcouch"), "openclaw-plugin");
}

function pluginSource(): string {
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "plugin.template.ts"), "utf8");
  return stampCliPath(raw, cliPath());
}

/**
 * Install the OpenClaw adapter. OpenClaw installs native plugins from a
 * directory, so we generate one (index.ts + openclaw.plugin.json +
 * package.json) under the Lazy Polyglot data dir and print the commands that link
 * and enable it. We don't run `openclaw` ourselves: linking a plugin and
 * granting it conversation access are the user's decisions.
 *
 * Idempotent: re-running refreshes the directory; a foreign index.ts is never
 * overwritten. An old install (generated plugin from the LangCouch days, marked
 * "langcouch") is deleted, or refreshed in place if it is the same directory.
 * With no arguments the old install is looked up at its default place; a test
 * passing only `dir` never goes looking in the real home.
 */
export function installOpenclaw(dir?: string, legacyDir?: string): string {
  if (dir === undefined) {
    dir = join(DATA_DIR, "openclaw-plugin");
    legacyDir ??= legacyPluginDir();
  }
  const indexPath = join(dir, "index.ts");
  const existing = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  const action = ownershipAction(existing, [PLUGIN_MARKER, LEGACY_MARKER], indexPath);

  let removedLegacy = false;
  if (legacyDir && resolve(legacyDir) !== resolve(dir)) {
    const legacyIndex = join(legacyDir, "index.ts");
    if (existsSync(legacyIndex) && readFileSync(legacyIndex, "utf8").includes(LEGACY_MARKER)) {
      rmSync(legacyDir, { recursive: true });
      removedLegacy = true;
    }
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(indexPath, pluginSource());
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      { name: "lazy-polyglot", version: packageVersion(), private: true, type: "module", openclaw: { extensions: ["./index.ts"] } },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(dir, "openclaw.plugin.json"),
    JSON.stringify(
      {
        id: "lazy-polyglot",
        name: "Lazy Polyglot",
        description: "Learn a language while you work (diglot weave in agent replies)",
        version: packageVersion(),
        activation: { onStartup: true },
        configSchema: { type: "object", additionalProperties: false },
      },
      null,
      2,
    ) + "\n",
  );

  return [
    `Plugin ${action} at ${dir}`,
    ...(removedLegacy || existing.includes(LEGACY_MARKER)
      ? [`Replaced the old langcouch plugin${removedLegacy ? ` (deleted ${legacyDir})` : ""}. Unregister it from OpenClaw first, so it doesn't run twice:`, `  openclaw plugins uninstall langcouch`, `  openclaw config unset plugins.entries.langcouch`]
      : []),
    ``,
    `Link it into OpenClaw, allow the prompt hook, and enable it:`,
    `  openclaw plugins install --link ${JSON.stringify(dir)} --force --accept-capabilities`,
    `  openclaw config set plugins.entries.lazy-polyglot.hooks.allowConversationAccess true --strict-json`,
    `  openclaw plugins enable lazy-polyglot`,
    ``,
    `The allowConversationAccess line is required: OpenClaw only runs prompt hooks of non-bundled plugins you allowed.`,
    `Check it loaded: openclaw plugins inspect lazy-polyglot --runtime`,
    `In a chat: /lazy-polyglot status, /lazy-polyglot lang es, /lazy-polyglot pause.`,
  ].join("\n");
}
