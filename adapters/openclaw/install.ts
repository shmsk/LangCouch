import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { DATA_DIR } from "../../src/store.ts";
import { cliPath, packageVersion, stampCliPath, ownershipAction } from "../shared/stamp.ts";

const PLUGIN_MARKER = "/* langcouch */";

function pluginSource(): string {
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "plugin.template.ts"), "utf8");
  return stampCliPath(raw, cliPath());
}

/**
 * Install the OpenClaw adapter. OpenClaw installs native plugins from a
 * directory, so we generate one (index.ts + openclaw.plugin.json +
 * package.json) under the LangCouch data dir and print the commands that link
 * and enable it. We don't run `openclaw` ourselves: linking a plugin and
 * granting it conversation access are the user's decisions.
 *
 * Idempotent: re-running refreshes the directory; a foreign index.ts is never
 * overwritten.
 */
export function installOpenclaw(dir: string = join(DATA_DIR, "openclaw-plugin")): string {
  const indexPath = join(dir, "index.ts");
  const existing = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  const action = ownershipAction(existing, PLUGIN_MARKER, indexPath);

  mkdirSync(dir, { recursive: true });
  writeFileSync(indexPath, pluginSource());
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      { name: "langcouch", version: packageVersion(), private: true, type: "module", openclaw: { extensions: ["./index.ts"] } },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(dir, "openclaw.plugin.json"),
    JSON.stringify(
      {
        id: "langcouch",
        name: "LangCouch",
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
    ``,
    `Link it into OpenClaw, allow the prompt hook, and enable it:`,
    `  openclaw plugins install --link ${JSON.stringify(dir)} --force --accept-capabilities`,
    `  openclaw config set plugins.entries.langcouch.hooks.allowConversationAccess true --strict-json`,
    `  openclaw plugins enable langcouch`,
    ``,
    `The allowConversationAccess line is required: OpenClaw only runs prompt hooks of non-bundled plugins you allowed.`,
    `Check it loaded: openclaw plugins inspect langcouch --runtime`,
    `In a chat: /langcouch status, /langcouch lang es, /langcouch pause.`,
  ].join("\n");
}
