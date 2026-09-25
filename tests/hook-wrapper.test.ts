import { describe, expect, test } from "bun:test";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOOK = join(import.meta.dir, "..", "scripts", "hook.sh");

// A PATH with only the utilities hook.sh needs — no bun, no node.
function runtimeFreePath(): string {
  const bin = mkdtempSync(join(tmpdir(), "langcouch-nobin-"));
  for (const tool of ["cat", "dirname"]) {
    const found = spawnSync("/bin/sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
    symlinkSync(found, join(bin, tool));
  }
  return bin;
}

function runHook(payload: object) {
  return spawnSync("/bin/sh", [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { PATH: runtimeFreePath(), HOME: tmpdir() },
  });
}

describe("hook wrapper without bun or node", () => {
  test("SessionStart tells the model the plugin is inactive, exit 0", () => {
    const r = runHook({ session_id: "s", hook_event_name: "SessionStart" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("<langcouch>");
    expect(r.stdout).toContain("Node.js >= 22.6");
  });

  test("UserPromptSubmit stays silent, exit 0", () => {
    const r = runHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "hi" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});
