import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installOpenclaw } from "../adapters/openclaw/install.ts";
import { cliPath, packageVersion } from "../adapters/shared/stamp.ts";

let dir: string;

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), "lazy-polyglot-openclaw-")), "openclaw-plugin");
});
afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

describe("installOpenclaw", () => {
  test("generates index.ts + manifests and prints the link commands", () => {
    const msg = installOpenclaw(dir);
    expect(msg).toContain("Plugin added");
    expect(msg).toContain("openclaw plugins install --link");
    expect(msg).toContain("plugins.entries.lazy-polyglot.hooks.allowConversationAccess true");

    const index = readFileSync(join(dir, "index.ts"), "utf8");
    expect(index).toContain("/* lazy-polyglot */");
    expect(index).toContain(`const CLI_PATH = ${JSON.stringify(cliPath())};`);
    expect(index).not.toContain("__LAZY_POLYGLOT_CLI_PATH__");

    const manifest = JSON.parse(readFileSync(join(dir, "openclaw.plugin.json"), "utf8"));
    expect(manifest.id).toBe("lazy-polyglot");
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

describe("installOpenclaw over an old LangCouch install", () => {
  const seed = (legacy: string) => {
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "index.ts"), "/* langcouch */\nexport default {};\n");
    writeFileSync(join(legacy, "openclaw.plugin.json"), JSON.stringify({ id: "langcouch" }));
    writeFileSync(join(legacy, "package.json"), JSON.stringify({ name: "langcouch" }));
  };

  test("the old generated plugin dir is deleted and the new commands name lazy-polyglot", () => {
    const legacy = join(dir, "..", "legacy-openclaw-plugin");
    seed(legacy);
    const msg = installOpenclaw(dir, legacy);
    expect(msg).toContain("Replaced the old langcouch plugin");
    expect(msg).toContain("openclaw plugins uninstall langcouch");
    expect(existsSync(legacy)).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, "openclaw.plugin.json"), "utf8")).id).toBe("lazy-polyglot");
    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name).toBe("lazy-polyglot");
    expect(installOpenclaw(dir, legacy)).not.toContain("old langcouch");
  });

  test("same directory: refreshed in place, nothing of the old manifests left", () => {
    seed(dir);
    const msg = installOpenclaw(dir, dir);
    expect(msg).toContain("Plugin updated");
    expect(msg).toContain("Replaced the old langcouch plugin");
    expect(readFileSync(join(dir, "index.ts"), "utf8")).toContain("/* lazy-polyglot */");
    expect(readFileSync(join(dir, "index.ts"), "utf8")).not.toContain("langcouch");
    expect(JSON.parse(readFileSync(join(dir, "openclaw.plugin.json"), "utf8")).id).toBe("lazy-polyglot");
  });

  test("a foreign index.ts at the old path is left alone", () => {
    const legacy = join(dir, "..", "legacy-openclaw-plugin");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "index.ts"), "export default {};\n");
    installOpenclaw(dir, legacy);
    expect(existsSync(join(legacy, "index.ts"))).toBe(true);
  });
});
