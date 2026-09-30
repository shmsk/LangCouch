/**
 * Deterministic weave-quality metrics for one reply. No LLM judge: every number
 * here can be checked by reading the reply. Used by evals/weave.ts.
 */
import { wovenPairs, stem } from "../tests/smoke/woven.ts";

export interface Served {
  /** Lemma the instruction listed ("dejar") */
  target: string;
  /** Translation the instruction gave ("to leave") */
  gloss: string;
}

export interface CaseSpec {
  served: Served[];
  /** Target-side suffix of the word-building rule, if the instruction had one ("-ista") */
  ruleSuffix?: string;
  /** Strings the reply's code must keep verbatim (identifiers, paths, flags from the prompt) */
  mustKeep?: string[];
}

export interface ReplyMetrics {
  /** Served lemmas woven as **word** (gloss) */
  woven: string[];
  /** Bold pairs that are no served word, no rule word, no whole sentence */
  offList: string[];
  /** Pairs whose gloss repeats the word: tiempo (tiempo) */
  selfGloss: string[];
  /** Served pairs whose gloss doesn't match the listed translation */
  wrongGloss: string[];
  /** Served words that appear in prose but never in the **word** (gloss) format */
  unformatted: string[];
  /** A served word or ** inside code, or a mustKeep string missing */
  codeTouched: string[];
  /** Distinct woven words (served + off-list) */
  weaveCount: number;
  /** Rule word used, when the instruction had one */
  ruleUsed: boolean;
  /** A whole bolded sentence (the level 7+ task) */
  sentence: boolean;
}

const norm = (s: string) => s.normalize("NFC").toLowerCase();
const tokens = (s: string) => norm(s).split(/[^\p{L}]+/u).filter(Boolean);

/** Code the weave must not touch: fenced blocks and inline spans. */
export function splitCode(reply: string): { prose: string; code: string } {
  const code: string[] = [];
  const prose = reply
    .replace(/```[\s\S]*?(```|$)/g, (m) => (code.push(m), "\n"))
    .replace(/`[^`\n]+`/g, (m) => (code.push(m), " "));
  return { prose, code: code.join("\n") };
}

/**
 * Strict check for a Spanish form of a lemma in running prose, where the loose
 * stem match would fire on English words (casa → "case"). Plural, gender, and
 * common verb endings only.
 */
export function inflects(token: string, lemma: string): boolean {
  const t = norm(token), l = norm(lemma);
  if (t === l || t === l + "s" || t === l + "es") return true;
  const verb = l.match(/^(.+)(ar|er|ir)$/);
  if (verb) return t.startsWith(verb[1]!) && VERB_ENDINGS.has(t.slice(verb[1]!.length));
  const root = l.replace(/[aoe]$/, "");
  return root !== l && ["a", "o", "as", "os"].includes(t.slice(root.length)) && t.startsWith(root);
}
const VERB_ENDINGS = new Set(["o", "as", "a", "amos", "an", "es", "e", "emos", "en", "imos", "ado", "ada", "ido", "ida", "ando", "iendo", "é", "ó", "ió", "aba", "ía"]);

const matchesLemma = (token: string, lemma: string) => token.startsWith(stem(lemma));

/** Does a gloss carry the listed translation? Compares content words by prefix, so "left" ≈ "leave" fails but "houses" ≈ "house" passes. */
export function glossMatches(given: string, listed: string): boolean {
  const want = tokens(listed).filter((t) => t.length >= 3 && t !== "the");
  const got = tokens(given);
  return want.length === 0 || want.some((w) => got.some((g) => g.startsWith(w.slice(0, 4)) || w.startsWith(g.slice(0, 4))));
}

export function scoreReply(reply: string, spec: CaseSpec): ReplyMetrics {
  const { prose, code } = splitCode(reply);
  const pairs = wovenPairs(prose);
  const suffix = spec.ruleSuffix ? norm(spec.ruleSuffix.replace(/^-/, "")) : null;

  const woven = new Set<string>();
  const offList = new Set<string>();
  const selfGloss: string[] = [];
  const wrongGloss: string[] = [];
  let ruleUsed = false;
  let sentence = false;

  for (const p of pairs) {
    const toks = tokens(p.word);
    if (norm(p.word) === norm(p.gloss)) selfGloss.push(`${p.word} (${p.gloss})`);
    if (toks.length >= 4) { sentence = true; continue; }
    const hit = spec.served.find((s) => toks.some((t) => matchesLemma(t, s.target) || inflects(t, s.target)));
    if (hit) {
      woven.add(hit.target);
      if (toks.length === 1 && !glossMatches(p.gloss, hit.gloss)) wrongGloss.push(`${p.word} (${p.gloss}) ≠ ${hit.gloss}`);
      continue;
    }
    if (suffix && toks.length === 1 && toks[0]!.endsWith(suffix)) { ruleUsed = true; continue; }
    offList.add(norm(p.word));
  }

  // the level 7+ sentence may come italic or bold, as long as a translation follows it
  if (/(\*{1,2}|_)[^*_\n]{15,200}\1\s*\([^)\n]{10,}\)/.test(prose)) sentence = true;

  // a served word in prose that never got the bold+gloss treatment
  const proseTokens = tokens(prose);
  const unformatted = spec.served
    .filter((s) => !woven.has(s.target) && proseTokens.some((t) => inflects(t, s.target)))
    .map((s) => s.target);

  const codeTouched: string[] = [];
  const codeTokens = tokens(code);
  for (const s of spec.served) if (codeTokens.some((t) => t === norm(s.target))) codeTouched.push(`${s.target} in code`);
  if (/\*\*[^*\s][^*]*\*\*/.test(code)) codeTouched.push("** in code");
  for (const k of spec.mustKeep ?? []) if (!reply.includes(k)) codeTouched.push(`missing ${k}`);

  return {
    woven: [...woven],
    offList: [...offList],
    selfGloss,
    wrongGloss,
    unformatted,
    codeTouched,
    weaveCount: woven.size + offList.size,
    ruleUsed,
    sentence,
  };
}
