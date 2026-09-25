import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { writeAgentsSection, AGENTS_START, AGENTS_END } from "../adapters/shared/agents-section.ts";

const freshFile = () => join(mkdtempSync(join(tmpdir(), "langcouch-agents-")), "AGENTS.md");

describe("writeAgentsSection", () => {
  test("creates the section in a fresh file", () => {
    const path = freshFile();
    const action = writeAgentsSection(path, "/abs/path/to/cli.ts");
    expect(action).toBe("added");
    const contents = readFileSync(path, "utf8");
    expect(contents).toContain(AGENTS_START);
    expect(contents).toContain(AGENTS_END);
    expect(contents).toContain("/abs/path/to/cli.ts");
  });

  test("updates in place on re-run (no duplication)", () => {
    const path = freshFile();
    writeAgentsSection(path, "/old/cli.ts");
    const before = readFileSync(path, "utf8");
    const action = writeAgentsSection(path, "/new/cli.ts");
    expect(action).toBe("updated");
    const after = readFileSync(path, "utf8");
    expect(after).toContain("/new/cli.ts");
    expect(after).not.toContain("/old/cli.ts");
    // only one section
    expect(after.split(AGENTS_START).length).toBe(2);
    expect(after.split(AGENTS_END).length).toBe(2);
    // length stays reasonable (no duplication creep)
    expect(after.length).toBeLessThan(before.length + 50);
  });

  test("preserves surrounding content when refreshing", () => {
    const path = freshFile();
    const dir = dirname(path);
    writeFileSync(path, "# Project notes\n\nSome existing content.\n");
    writeAgentsSection(path, "/abs/cli.ts");
    const after = readFileSync(path, "utf8");
    expect(after).toContain("Project notes");
    expect(after).toContain("Some existing content.");
    expect(after).toContain(AGENTS_START);
  });

  test("bakes the cliPath into the run instruction", () => {
    const path = freshFile();
    writeAgentsSection(path, "/weird path with spaces/cli.ts");
    const contents = readFileSync(path, "utf8");
    expect(contents).toContain("/weird path with spaces/cli.ts");
  });
});