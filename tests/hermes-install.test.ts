import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHermes } from "../adapters/hermes/install.ts";
import { cliPath, packageVersion } from "../adapters/shared/stamp.ts";

let scratch: string;
let origHermesHome: string | undefined;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "lazy-polyglot-hermes-"));
  origHermesHome = process.env.HERMES_HOME;
  process.env.HERMES_HOME = scratch;
});

afterEach(() => {
  if (origHermesHome === undefined) delete process.env.HERMES_HOME;
  else process.env.HERMES_HOME = origHermesHome;
  rmSync(scratch, { recursive: true, force: true });
});

const dir = () => join(scratch, "plugins", "lazy-polyglot");

describe("installHermes", () => {
  test("writes __init__.py + plugin.yaml under $HERMES_HOME/plugins/lazy-polyglot", () => {
    const msg = installHermes();
    expect(msg).toContain("Plugin added");
    expect(msg).toContain("hermes plugins enable lazy-polyglot");

    const init = readFileSync(join(dir(), "__init__.py"), "utf8");
    expect(init.startsWith("# lazy-polyglot")).toBe(true);
    expect(init).toContain(`CLI_PATH = ${JSON.stringify(cliPath())}`);
    expect(init).not.toContain("__LAZY_POLYGLOT_CLI_PATH__");

    const yaml = readFileSync(join(dir(), "plugin.yaml"), "utf8");
    expect(yaml).toContain("name: lazy-polyglot");
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

describe("installHermes over an old LangCouch install", () => {
  const legacyDir = () => join(scratch, "plugins", "langcouch");
  const seedLegacy = () => {
    mkdirSync(legacyDir(), { recursive: true });
    writeFileSync(join(legacyDir(), "__init__.py"), "# langcouch\ndef register(ctx): pass\n");
    writeFileSync(join(legacyDir(), "plugin.yaml"), "# langcouch\nname: langcouch\n");
  };

  test("the old plugin dir is removed and only the new one remains", () => {
    seedLegacy();
    const msg = installHermes();
    expect(msg).toContain("Removed the old langcouch plugin");
    expect(msg).toContain("hermes plugins disable langcouch");
    expect(existsSync(legacyDir())).toBe(false);
    expect(readFileSync(join(dir(), "__init__.py"), "utf8")).toContain("# lazy-polyglot");
    expect(readFileSync(join(dir(), "plugin.yaml"), "utf8")).toContain("name: lazy-polyglot");

    expect(installHermes()).not.toContain("old langcouch");
  });

  test("a foreign file in the old dir survives; only our two files go", () => {
    seedLegacy();
    writeFileSync(join(legacyDir(), "notes.txt"), "mine");
    installHermes();
    expect(readdirSync(legacyDir())).toEqual(["notes.txt"]);
  });

  test("a foreign plugin at the old path is left alone", () => {
    mkdirSync(legacyDir(), { recursive: true });
    writeFileSync(join(legacyDir(), "__init__.py"), "def register(ctx): pass\n");
    expect(installHermes()).not.toContain("old langcouch");
    expect(readFileSync(join(legacyDir(), "__init__.py"), "utf8")).toBe("def register(ctx): pass\n");
  });
});
