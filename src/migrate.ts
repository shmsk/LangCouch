import { homedir } from "node:os";
import { join } from "node:path";
import { cpSync, existsSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";

/**
 * Lazy Polyglot used to be LangCouch and kept its data in ~/.langcouch. The first run after the
 * rename moves that folder to ~/.lazy-polyglot, so nobody loses progress. Only when no env var picks
 * the data dir, the new dir is absent and the old one is there; an existing new dir is never touched.
 * Never throws (hooks must not break the host session): on any failure the old dir stays where it was.
 */
export const DATA_DIR_NAME = ".lazy-polyglot";
export const LEGACY_DATA_DIR_NAME = ".langcouch";

/** Every file under `dir` as relative path -> size, to check a copy against its source. */
function inventory(dir: string, rel = ""): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const path = join(rel, entry.name);
    if (entry.isDirectory()) for (const [p, n] of inventory(dir, path)) out.set(p, n);
    else out.set(path, statSync(join(dir, path)).size);
  }
  return out;
}

/**
 * The cross-device way: copy next to the target and rename into place, so a half-copied dir never
 * looks like the real one; the source is removed only once file count and sizes match.
 */
export function copyMove(from: string, to: string): void {
  const staging = `${to}.migrating-${process.pid}`;
  try {
    cpSync(from, staging, { recursive: true, errorOnExist: true, force: false });
    const want = inventory(from);
    const got = inventory(staging);
    const same = want.size === got.size && [...want].every(([p, n]) => got.get(p) === n);
    if (!same || existsSync(to)) return;
    renameSync(staging, to);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  rmSync(from, { recursive: true, force: true });
}

export function migrateLegacyDataDir(home = homedir(), env: NodeJS.ProcessEnv = process.env): void {
  if (env.LAZY_POLYGLOT_DIR || env.LANGCOUCH_DIR) return;
  const from = join(home, LEGACY_DATA_DIR_NAME);
  const to = join(home, DATA_DIR_NAME);
  try {
    if (existsSync(to) || !existsSync(from)) return;
    try {
      renameSync(from, to);
      return;
    } catch {
      // another process got there first, or a cross-device move: fall through to copy
    }
    if (existsSync(to) || !existsSync(from)) return;
    copyMove(from, to);
  } catch {
    // leave everything as it is; the next run tries again
  }
}
