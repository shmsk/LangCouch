import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installOpenclaw } from "../adapters/openclaw/install.ts";
import { cliPath, packageVersion } from "../adapters/shared/stamp.ts";

let dir: string;

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), "langcouch-openclaw-")), "openclaw-plugin");
});
afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

describe("installOpenclaw", () => {
  test("generates index.ts + manifests and prints the link commands", () => {
    const msg = installOpenclaw(dir);
    expect(msg).toContain("Plugin added");
    expect(msg).toContain("openclaw plugins install --link");
    expect(msg).toContain("plugins.entries.langcouch.hooks.allowConversationAccess true");

    const index = readFileSync(join(dir, "index.ts"), "utf8");
    expect(index).toContain("/* langcouch */");
    expect(index).toContain(`const CLI_PATH = ${JSON.stringify(cliPath())};`);
    expect(index).not.toContain("__LANGCOUCH_CLI_PATH__");

    const manifest = JSON.parse(readFileSync(join(dir, "openclaw.plugin.json"), "utf8"));
    expect(manifest.id).toBe("langcouch");
    expect(manifest.activation.onStartup).toBe(true);
    expect(manifest.configSchema.type).toBe("object");

    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(pkg.openclaw.extensions).toEqual(["./index.ts"]);
    expect(pkg.version).toBe(packageVersion());
  });

  test("re-running refreshes in place", () => {
    installOpenclaw(dir);
    expect(installOpenclaw(dir)).toContain("Plugin updated");
  });

  test("refuses to overwrite a foreign index.ts", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.ts"), "export default {};\n");
    expect(() => installOpenclaw(dir)).toThrow("isn't ours");
  });
});
