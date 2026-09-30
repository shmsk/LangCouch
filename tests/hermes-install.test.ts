import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHermes } from "../adapters/hermes/install.ts";
import { cliPath, packageVersion } from "../adapters/shared/stamp.ts";

let scratch: string;
let origHermesHome: string | undefined;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "langcouch-hermes-"));
  origHermesHome = process.env.HERMES_HOME;
  process.env.HERMES_HOME = scratch;
});

afterEach(() => {
  if (origHermesHome === undefined) delete process.env.HERMES_HOME;
  else process.env.HERMES_HOME = origHermesHome;
  rmSync(scratch, { recursive: true, force: true });
});

const dir = () => join(scratch, "plugins", "langcouch");

describe("installHermes", () => {
  test("writes __init__.py + plugin.yaml under $HERMES_HOME/plugins/langcouch", () => {
    const msg = installHermes();
    expect(msg).toContain("Plugin added");
    expect(msg).toContain("hermes plugins enable langcouch");

    const init = readFileSync(join(dir(), "__init__.py"), "utf8");
    expect(init.startsWith("# langcouch")).toBe(true);
    expect(init).toContain(`CLI_PATH = ${JSON.stringify(cliPath())}`);
    expect(init).not.toContain("__LANGCOUCH_CLI_PATH__");

    const yaml = readFileSync(join(dir(), "plugin.yaml"), "utf8");
    expect(yaml).toContain("name: langcouch");
    expect(yaml).toContain(`version: ${packageVersion()}`);
    expect(yaml).toContain("  - pre_llm_call");
  });

  test("re-running refreshes in place", () => {
    installHermes();
    expect(installHermes()).toContain("Plugin updated");
    expect(existsSync(join(dir(), "__init__.py"))).toBe(true);
  });

  test("refuses to overwrite a foreign plugin", () => {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(join(dir(), "__init__.py"), "def register(ctx): pass\n");
    expect(() => installHermes()).toThrow("isn't ours");
    expect(readFileSync(join(dir(), "__init__.py"), "utf8")).toBe("def register(ctx): pass\n");
  });

  test("refuses when only plugin.yaml is foreign", () => {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(join(dir(), "plugin.yaml"), "name: someone-else\n");
    expect(() => installHermes()).toThrow("isn't ours");
    expect(existsSync(join(dir(), "__init__.py"))).toBe(false);
  });
});
