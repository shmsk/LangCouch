import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { writeAgentsSection, removeAgentsSection, AGENTS_START, AGENTS_END, LEGACY_AGENTS_START, LEGACY_AGENTS_END } from "../adapters/shared/agents-section.ts";

const freshFile = () => join(mkdtempSync(join(tmpdir(), "lazy-polyglot-agents-")), "AGENTS.md");

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

describe("upgrade from the LangCouch markers", () => {
  const legacy = (cli: string) =>
    [LEGACY_AGENTS_START, "## LangCouch — passive language immersion", `run \`bun ${cli} hook\` (the <langcouch> block)`, LEGACY_AGENTS_END].join("\n");

  test("an old section is replaced in place by the new one, surroundings kept", () => {
    const path = freshFile();
    writeFileSync(path, `# Notes\n\n${legacy("/old/cli.ts")}\n\n# After\n`);
    expect(writeAgentsSection(path, "/new/cli.ts")).toBe("updated");
    const after = readFileSync(path, "utf8");
    expect(after).not.toContain("langcouch");
    expect(after.split(AGENTS_START).length).toBe(2);
    expect(after).toContain("/new/cli.ts");
    expect(after).not.toContain("/old/cli.ts");
    expect(after.indexOf("# Notes")).toBeLessThan(after.indexOf(AGENTS_START));
    expect(after.indexOf(AGENTS_START)).toBeLessThan(after.indexOf("# After"));
  });

  test("an old section next to a new one: only the new one remains", () => {
    const path = freshFile();
    writeAgentsSection(path, "/new/cli.ts");
    writeFileSync(path, `${legacy("/old/cli.ts")}\n\n${readFileSync(path, "utf8")}`);
    writeAgentsSection(path, "/new/cli.ts");
    const after = readFileSync(path, "utf8");
    expect(after).not.toContain("langcouch");
    expect(after.split(AGENTS_START).length).toBe(2);
  });

  test("removeAgentsSection takes out an old section too, and deletes a file that held only it", () => {
    const path = freshFile();
    writeFileSync(path, `# Keep me\n\n${legacy("/old/cli.ts")}\n`);
    expect(removeAgentsSection(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("# Keep me\n");

    const only = freshFile();
    writeFileSync(only, `${legacy("/old/cli.ts")}\n`);
    expect(removeAgentsSection(only)).toBe(true);
    expect(existsSync(only)).toBe(false);
  });
});
