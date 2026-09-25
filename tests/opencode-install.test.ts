import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { installOpencode, stampCliPath } from "../adapters/opencode/install.ts";

const PLUGIN_MARKER = "/* langcouch */";

let scratch: string;
let origCwd: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "langcouch-opencode-"));
  origCwd = process.cwd();
  process.chdir(scratch);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(scratch, { recursive: true, force: true });
});

describe("installOpencode", () => {
  test("project scope: writes plugin + AGENTS.md, returns added", () => {
    const msg = installOpencode("project");
    expect(msg).toContain("Plugin added");
    expect(msg).toContain("AGENTS.md section added");

    const pluginPath = join(scratch, ".opencode", "plugin", "langcouch.ts");
    expect(existsSync(pluginPath)).toBe(true);
    const plugin = readFileSync(pluginPath, "utf8");
    expect(plugin).toContain(PLUGIN_MARKER);
    expect(plugin).toContain("experimental.chat.messages.transform");
    // cliPath is stamped in (absolute path to src/cli.ts, not the placeholder)
    expect(plugin).toContain("/src/cli.ts");
    expect(plugin).not.toContain("__LANGCOUCH_CLI_PATH__");

    const agents = readFileSync(join(scratch, "AGENTS.md"), "utf8");
    expect(agents).toContain("<!-- langcouch:start -->");
    expect(agents).toContain("/src/cli.ts");
  });

  test("re-run updates in place (idempotency, no duplication)", () => {
    installOpencode("project");
    const msg2 = installOpencode("project");
    expect(msg2).toContain("Plugin updated");
    expect(msg2).toContain("AGENTS.md section updated");

    // only one plugin file, only one AGENTS.md section
    const plugin = readFileSync(join(scratch, ".opencode", "plugin", "langcouch.ts"), "utf8");
    expect(plugin.split(PLUGIN_MARKER).length).toBe(2);
    const agents = readFileSync(join(scratch, "AGENTS.md"), "utf8");
    expect(agents.split("<!-- langcouch:start -->").length).toBe(2);
  });

  test("refuses to clobber a non-langcouch plugin file", () => {
    mkdirSync(join(scratch, ".opencode", "plugin"), { recursive: true });
    writeFileSync(join(scratch, ".opencode", "plugin", "langcouch.ts"), "export default {}; // someone else's plugin");
    expect(() => installOpencode("project")).toThrow(/isn't ours/);
  });

  test("user scope: writes to ~/.config/opencode/plugin (uses HOME, not cwd)", () => {
    // point HOME at the scratch dir so we don't actually write to the real home
    const origHome = process.env.HOME;
    process.env.HOME = scratch;
    try {
      const msg = installOpencode("user");
      expect(msg).toContain("Plugin added");
      const pluginPath = join(scratch, ".config", "opencode", "plugin", "langcouch.ts");
      expect(existsSync(pluginPath)).toBe(true);
      // AGENTS.md still lands in the project (cwd), not in HOME
      expect(existsSync(join(scratch, "AGENTS.md"))).toBe(true);
    } finally {
      process.env.HOME = origHome;
    }
  });

  test("plugin template references the same src/cli.ts the installer computes", () => {
    installOpencode("project");
    const plugin = readFileSync(join(scratch, ".opencode", "plugin", "langcouch.ts"), "utf8");
    const match = /const CLI_PATH = "([^"]+)"/.exec(plugin);
    expect(match).not.toBeNull();
    const stamped = match![1];
    expect(stamped).toBe(resolve(join(dirname(new URL(import.meta.url).pathname), "..", "src", "cli.ts")));
  });
});

describe("stampCliPath — $-in-path hazard (function replacer)", () => {
  test("passes through paths containing $-patterns that String.replace would interpret", () => {
    const template = `const CLI_PATH = "__LANGCOUCH_CLI_PATH__";`;
    const tricky = "/weird/$HOME/$&/path/with/$1/and/$`/and/$'/";
    const out = stampCliPath(template, tricky);
    // the stamped value must be JSON-encoded (quoted) and contain the raw $ chars
    expect(out).toContain(JSON.stringify(tricky));
    expect(out).toContain("$&");
    expect(out).toContain("$1");
    expect(out).toContain("$`");
    expect(out).toContain("$'");
    // a naive string-replace would have turned $& into the matched substring
    // ("__LANGCOUCH_CLI_PATH__"), so confirm that's NOT present
    expect(out).not.toContain('__LANGCOUCH_CLI_PATH__"');
  });

  test("normal paths stamp cleanly", () => {
    const template = `const CLI_PATH = "__LANGCOUCH_CLI_PATH__";`;
    const out = stampCliPath(template, "/abs/path/to/cli.ts");
    expect(out).toBe(`const CLI_PATH = "/abs/path/to/cli.ts";`);
  });
});