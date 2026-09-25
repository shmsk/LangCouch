import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DUPLICATE_WINDOW_MS, invocationKey, isDuplicateInvocation } from "../src/guard.ts";

const freshDir = () => mkdtempSync(join(tmpdir(), "langcouch-guard-"));

describe("double-registration guard", () => {
  test("same key twice within the window → duplicate", () => {
    const dir = freshDir();
    const key = invocationKey("s1", "UserPromptSubmit", "hola");
    expect(isDuplicateInvocation(dir, key, 1000)).toBe(false);
    expect(isDuplicateInvocation(dir, key, 1000 + DUPLICATE_WINDOW_MS - 1)).toBe(true);
  });

  test("different key → not a duplicate", () => {
    const dir = freshDir();
    expect(isDuplicateInvocation(dir, invocationKey("s1", "UserPromptSubmit", "hola"), 1000)).toBe(false);
    expect(isDuplicateInvocation(dir, invocationKey("s1", "UserPromptSubmit", "adiós"), 1001)).toBe(false);
  });

  test("window expiry → not a duplicate", () => {
    const dir = freshDir();
    const key = invocationKey("s1", "SessionStart", "");
    expect(isDuplicateInvocation(dir, key, 1000)).toBe(false);
    expect(isDuplicateInvocation(dir, key, 1000 + DUPLICATE_WINDOW_MS)).toBe(false);
  });

  test("stamp is refreshed on every call (third rapid delivery still deduped)", () => {
    const dir = freshDir();
    const key = invocationKey("s1", "UserPromptSubmit", "hola");
    expect(isDuplicateInvocation(dir, key, 1000)).toBe(false);
    expect(isDuplicateInvocation(dir, key, 3000)).toBe(true);
    expect(isDuplicateInvocation(dir, key, 6000)).toBe(true); // within window of the 3000 stamp
  });

  test("different events never dedupe against each other", () => {
    const dir = freshDir();
    expect(isDuplicateInvocation(dir, invocationKey("s1", "SessionStart", "x"), 1000)).toBe(false);
    expect(isDuplicateInvocation(dir, invocationKey("s1", "UserPromptSubmit", "x"), 1001)).toBe(false);
  });

  test("corrupt stamp file → not a duplicate, then recovers", () => {
    const dir = freshDir();
    const key = invocationKey("s1", "UserPromptSubmit", "hola");
    Bun.write(join(dir, "last-hook.json"), "{broken");
    expect(isDuplicateInvocation(dir, key, 1000)).toBe(false);
    expect(isDuplicateInvocation(dir, key, 1001)).toBe(true);
  });
});
