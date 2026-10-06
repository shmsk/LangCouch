/**
 * Smoke-test assertions, run in CI after a host finished one turn.
 *
 *   bun tests/smoke/assert-woven.ts request <fake-llm-log.jsonl>
 *     The block reached the model: some recorded request carries <lazy-polyglot>.
 *   bun tests/smoke/assert-woven.ts reply <reply.txt> <lang>
 *     A real model wove what Lazy Polyglot served: at least one word the hook put
 *     into this run's instruction (read back from state.<lang>.json and mapped
 *     to its lemma via the wordlist) appears as **word** (translation).
 *   bun tests/smoke/assert-woven.ts settled
 *     The host's after-reply event reached Lazy Polyglot: a session in served.json
 *     was read back by a Stop (weave algorithm 3, honest counting).
 *
 * Prints what it found either way, so a red run shows why.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, loadWordlist } from "../../src/store.ts";
import { isWordKey, type State } from "../../src/types.ts";
import { wovenPairs, matchServed } from "./woven.ts";

const [mode, file, lang] = process.argv.slice(2);
if (mode === "settled") {
  const path = join(DATA_DIR, "served.json");
  const all = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, { stopSeen?: boolean; picks?: object }>) : {};
  console.log(`served.json: ${JSON.stringify(all)}`);
  if (Object.values(all).some((r) => r.stopSeen)) {
    console.log("OK: the after-reply event read a finished reply back");
    process.exit(0);
  }
  console.error("FAIL: no session was settled by an after-reply event (served words fall back to served = woven)");
  process.exit(1);
}
if (!file || (mode !== "request" && mode !== "reply") || (mode === "reply" && !lang)) {
  console.error("usage: assert-woven.ts request <log.jsonl> | reply <reply.txt> <lang> | settled");
  process.exit(2);
}
const text = readFileSync(file, "utf8");

if (mode === "request") {
  const lines = text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as { path: string; body: string });
  console.log(`${lines.length} request(s): ${lines.map((l) => l.path).join(", ")}`);
  // walk the parsed body for the string (a message's content) carrying the block
  const find = (v: unknown): string | undefined => {
    if (typeof v === "string") return v.includes("<lazy-polyglot>") ? v : undefined;
    if (v && typeof v === "object") for (const x of Object.values(v)) { const s = find(x); if (s) return s; }
    return undefined;
  };
  for (const l of lines) {
    let found: string | undefined;
    try { found = find(JSON.parse(l.body)); } catch { found = l.body.includes("<lazy-polyglot>") ? l.body : undefined; }
    if (found) {
      const at = found.indexOf("<lazy-polyglot>");
      console.log(`OK: <lazy-polyglot> found in ${l.path}:\n${found.slice(Math.max(0, at - 200), at + 300)}`);
      process.exit(0);
    }
  }
  console.error("FAIL: no request to the model contained a <lazy-polyglot> block");
  process.exit(1);
} else {
  console.log(`reply:\n${text}\n`);
  const statePath = join(DATA_DIR, `state.${lang}.json`);
  const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  // fresh data dir per run, so every word with a record was served by this run's hook: shown
  // (algorithms 1-2, or woven under 3), missed, or still waiting in served.json for its reply
  const servedIds = new Set(Object.keys(state).filter((k) => isWordKey(k) && ((state[k]?.exposures ?? 0) > 0 || (state[k]?.missed ?? 0) > 0)));
  const offers = join(DATA_DIR, "served.json");
  if (existsSync(offers)) for (const r of Object.values(JSON.parse(readFileSync(offers, "utf8")) as Record<string, { picks?: Record<string, string> }>)) for (const id of Object.keys(r.picks ?? {})) servedIds.add(id);
  const served = loadWordlist(lang!).filter((w) => servedIds.has(w.id)).map((w) => w.target);
  console.log(`served (${served.length}): ${served.join(", ") || "none"}`);
  if (served.length === 0) {
    console.error("FAIL: the hook served no words, so the plugin never ran in this turn");
    process.exit(1);
  }
  console.log(`bold pairs: ${wovenPairs(text).map((p) => `${p.word} (${p.gloss})`).join("; ") || "none"}`);
  const hits = matchServed(text, served);
  if (hits.length === 0) {
    console.error("FAIL: none of the served words appears as **word** (translation)");
    process.exit(1);
  }
  console.log(`OK: wove ${hits.length} served word(s): ${hits.join(", ")}`);
}
