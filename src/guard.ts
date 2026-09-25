import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Double-registration guard: when both the Claude Code plugin hook and a legacy
 * `install claude` settings.json hook are registered, the same UserPromptSubmit
 * payload is delivered twice. Without a guard the instruction would be injected
 * twice and every exposure counted twice per prompt.
 *
 * Dedupe lives in the CLI (entry-point agnostic): two identical payloads within
 * the window mean double registration, not two prompts.
 */
export const DUPLICATE_WINDOW_MS = 5000;

const STAMP_FILE = "last-hook.json";

export function invocationKey(sessionId: string, eventName: string, prompt: string): string {
  return createHash("sha256").update(`${sessionId}:${eventName}:${prompt}`).digest("hex");
}

/**
 * Returns true when the same key was stamped within the window (duplicate delivery).
 * Always writes the current stamp. Best-effort: any IO error means "not a duplicate".
 */
export function isDuplicateInvocation(dataDir: string, key: string, nowMs: number): boolean {
  const path = join(dataDir, STAMP_FILE);
  let duplicate = false;
  try {
    if (existsSync(path)) {
      const prev = JSON.parse(readFileSync(path, "utf8")) as { key?: string; at?: number };
      duplicate = prev.key === key && typeof prev.at === "number" && nowMs - prev.at < DUPLICATE_WINDOW_MS;
    }
  } catch {
    // unreadable stamp — treat as no duplicate, fall through to rewrite it
  }
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path, JSON.stringify({ key, at: nowMs }));
  } catch {
    // stamp not persisted — next call simply won't dedupe; acceptable
  }
  return duplicate;
}
