// The checks `claude plugin validate` runs on the manifest's types contract and hooks.
// tsconfig does not include mods/, so without this a broken contract ships unnoticed (0.9.7 rename).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = join(import.meta.dir, "..");
const plugin = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"));
const typesPath = join(root, plugin.types);
const typesSource = readFileSync(typesPath, "utf8");

describe("plugin manifest", () => {
  test("the types contract parses as TypeScript", () => {
    // transpiled as .ts: a .d.ts emits nothing and transpileModule throws
    const out = ts.transpileModule(typesSource, { fileName: "contract.ts", reportDiagnostics: true });
    const errors = (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    expect(errors).toEqual([]);
  });

  test("PluginState is keyed by the plugin name the cards mod writes to", () => {
    const key = typesSource.match(/interface PluginState\s*{\s*['"]?([\w-]+)['"]?\s*:/)?.[1];
    expect(key).toBe(plugin.name);
    const register = readFileSync(join(root, "mods/cards/hooks/register.tsx"), "utf8");
    expect(register).toContain(`plugin: '${plugin.name}'`);
  });

  test("hook commands quote ${CLAUDE_PLUGIN_ROOT}", () => {
    const hooks = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks;
    const commands: string[] = Object.values(hooks).flatMap((groups: any) =>
      groups.flatMap((g: any) => g.hooks.map((h: any) => h.command)),
    );
    expect(commands.length).toBeGreaterThan(0);
    for (const c of commands) expect(c).toMatch(/^"\$\{CLAUDE_PLUGIN_ROOT\}[^"]*"/);
  });
});
