/**
 * Smoke-test assertions, run in CI after a host finished one turn.
 *
 *   bun tests/smoke/assert-woven.ts request <fake-llm-log.jsonl>
 *     The block reached the model: some recorded request carries <langcouch>.
 *   bun tests/smoke/assert-woven.ts reply <reply.txt>
 *     A real model wove: the reply has at least one **word** (translation).
 *
 * Prints what it found either way, so a red run shows why.
 */
import { readFileSync } from "node:fs";

const [mode, file] = process.argv.slice(2);
if (!file || (mode !== "request" && mode !== "reply")) {
  console.error("usage: assert-woven.ts <request|reply> <file>");
  process.exit(2);
}
const text = readFileSync(file, "utf8");

if (mode === "request") {
  const lines = text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as { path: string; body: string });
  console.log(`${lines.length} request(s): ${lines.map((l) => l.path).join(", ")}`);
  // walk the parsed body for the string (a message's content) carrying the block
  const find = (v: unknown): string | undefined => {
    if (typeof v === "string") return v.includes("<langcouch>") ? v : undefined;
    if (v && typeof v === "object") for (const x of Object.values(v)) { const s = find(x); if (s) return s; }
    return undefined;
  };
  for (const l of lines) {
    let found: string | undefined;
    try { found = find(JSON.parse(l.body)); } catch { found = l.body.includes("<langcouch>") ? l.body : undefined; }
    if (found) {
      const at = found.indexOf("<langcouch>");
      console.log(`OK: <langcouch> found in ${l.path}:\n${found.slice(Math.max(0, at - 200), at + 300)}`);
      process.exit(0);
    }
  }
  console.error("FAIL: no request to the model contained a <langcouch> block");
  process.exit(1);
} else {
  console.log(`reply:\n${text}\n`);
  // **palabra** (word) — the format the weave instruction asks for
  const woven = [...text.matchAll(/\*\*([^*\n]{1,40})\*\*\s*\(([^)\n]{1,60})\)/g)].map((m) => `${m[1]} = ${m[2]}`);
  if (woven.length === 0) {
    console.error("FAIL: no **word** (translation) in the reply");
    process.exit(1);
  }
  console.log(`OK: woven ${woven.length}: ${woven.join("; ")}`);
}
