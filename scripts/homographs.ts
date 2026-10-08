// Regenerates data/homographs.json: per bundled language, the lemmas that are also English words
// (it: via, fine, due). A prompt recall of one counts only outside English sentences (src/recall.ts).
// Needs the macOS word list; rerun after a wordlist change: bun scripts/homographs.ts
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DICT = "/usr/share/dict/web2";
if (!existsSync(DICT)) throw new Error(`${DICT} not found: run this on macOS`);
// bundled lists only: a throwaway data dir keeps user-added wordlists (and user data) out
process.env.LAZY_POLYGLOT_DIR = mkdtempSync(join(tmpdir(), "lazy-polyglot-homographs-"));
const { loadWordlist, WORDLISTS_DIR, HOMOGRAPHS_PATH } = await import("../src/store.ts");

// lowercase entries only: capitalized ones are proper names
const english = new Set(readFileSync(DICT, "utf8").split("\n").filter((w) => w && w === w.toLowerCase()));
const out: Record<string, string[]> = {};
for (const file of readdirSync(WORDLISTS_DIR).sort()) {
  const lang = file.replace(/\.json$/, "");
  if (lang.split("-")[0] === "en") continue;
  const words = [...new Set(loadWordlist(lang).map((w) => w.target.toLowerCase()))].filter((t) => english.has(t)).sort();
  if (words.length) out[lang] = words;
}
writeFileSync(HOMOGRAPHS_PATH, JSON.stringify(out, null, 2) + "\n");
console.log(Object.entries(out).map(([l, w]) => `${l}: ${w.length}`).join(", "));
