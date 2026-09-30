import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const PLACEHOLDER = '"__LANGCOUCH_CLI_PATH__"';

/** Absolute path to src/cli.ts in this checkout. */
export function cliPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "cli.ts");
}

/** Version from package.json, stamped into host manifests. */
export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8"));
  return String(pkg.version);
}

/**
 * Stamp the absolute CLI path into a plugin template.
 * Pure function — extracted for testability. Uses a function replacer so `$`
 * characters in the path (e.g. `$HOME`, `$&`) are not interpreted as
 * String.replace pattern variables. JSON.stringify gives a string literal that
 * is valid in both TypeScript and Python.
 */
export function stampCliPath(template: string, path: string): string {
  return template.replace(PLACEHOLDER, () => JSON.stringify(path));
}

/**
 * Write-guard shared by the file-based adapters: a file carrying our marker
 * may be refreshed, a foreign file is never overwritten.
 */
export function ownershipAction(existing: string, marker: string, path: string): "added" | "updated" {
  if (existing.includes(marker)) return "updated";
  if (existing) throw new Error(`langcouch: ${path} already exists and isn't ours — move it aside and re-run`);
  return "added";
}
