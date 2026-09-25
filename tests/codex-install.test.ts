import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCodex } from "../adapters/codex/install.ts";
import { installClaude } from "../adapters/claude/install.ts";
import { writeAgentsSection, AGENTS_START } from "../adapters/shared/agents-section.ts";

let scratch: string;
let origCwd: string;
let origCodexHome: string | undefined;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "langcouch-codex-"));
  origCwd = process.cwd();
  origCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = join(scratch, "codex-home");
  process.chdir(scratch);
});

afterEach(() => {
  process.chdir(origCwd);
  if (origCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = origCodexHome;
  rmSync(scratch, { recursive: true, force: true });
});

const readHooks = (path: string) => JSON.parse(readFileSync(path, "utf8")).hooks;

describe("installCodex", () => {
  test("project scope: registers UserPromptSubmit + SessionStart in .codex/hooks.json", () => {
    const msg = installCodex("project");
    expect(msg).toContain("Hook installed (UserPromptSubmit + SessionStart)");
    expect(msg).toContain("/hooks");

    const hooks = readHooks(join(scratch, ".codex", "hooks.json"));
    for (const event of ["UserPromptSubmit", "SessionStart"]) {
      expect(hooks[event]).toHaveLength(1);
      expect(hooks[event][0].hooks[0].type).toBe("command");
      expect(hooks[event][0].hooks[0].command).toMatch(/^bun \/.*\/src\/cli\.ts hook$/);
    }
  });

  test("user scope: writes to $CODEX_HOME/hooks.json", () => {
    installCodex("user");
    expect(existsSync(join(scratch, "codex-home", "hooks.json"))).toBe(true);
    expect(existsSync(join(scratch, ".codex", "hooks.json"))).toBe(false);
  });

  test("idempotent: a rerun leaves the file alone", () => {
    installCodex("project");
    const path = join(scratch, ".codex", "hooks.json");
    const first = readFileSync(path, "utf8");
    expect(installCodex("project")).toContain("already installed");
    expect(readFileSync(path, "utf8")).toBe(first);
  });

  test("keeps the user's other hooks and settings", () => {
    const path = join(scratch, ".codex", "hooks.json");
    mkdirSync(join(scratch, ".codex"));
    const foreign = { hooks: [{ type: "command", command: "echo mine" }] };
    writeFileSync(path, JSON.stringify({ hooks: { UserPromptSubmit: [foreign], Stop: [foreign] }, other: 1 }));

    installCodex("project");
    const file = JSON.parse(readFileSync(path, "utf8"));
    expect(file.other).toBe(1);
    expect(file.hooks.Stop).toEqual([foreign]);
    expect(file.hooks.UserPromptSubmit).toHaveLength(2);
    expect(file.hooks.UserPromptSubmit[0]).toEqual(foreign);
  });

  test("migrates the old self-serve AGENTS.md section away, keeping the rest", () => {
    const agents = join(scratch, "AGENTS.md");
    writeFileSync(agents, "# My project rules\n\nBe nice.\n");
    writeAgentsSection(agents, "/x/src/cli.ts");

    const msg = installCodex("project");
    expect(msg).toContain("Removed the old self-serve langcouch section");
    const left = readFileSync(agents, "utf8");
    expect(left).not.toContain(AGENTS_START);
    expect(left).toBe("# My project rules\n\nBe nice.\n");
  });

  test("an AGENTS.md that held only our section is deleted", () => {
    const agents = join(scratch, "AGENTS.md");
    writeAgentsSection(agents, "/x/src/cli.ts");
    installCodex("project");
    expect(existsSync(agents)).toBe(false);
  });
});

describe("installClaude (shared JSON-hooks writer)", () => {
  test("project scope still writes both events to .claude/settings.json, idempotently", () => {
    expect(installClaude("project")).toContain("Hook installed (UserPromptSubmit + SessionStart)");
    const hooks = readHooks(join(scratch, ".claude", "settings.json"));
    expect(hooks.UserPromptSubmit[0].hooks[0].command).toMatch(/src\/cli\.ts hook$/);
    expect(hooks.SessionStart).toHaveLength(1);
    expect(installClaude("project")).toContain("already installed");
  });
});
