/**
 * Deterministic weave-quality metrics for one reply. No LLM judge: every number
 * here can be checked by reading the reply. Used by evals/weave.ts.
 */
import { wovenPairs, stem, inflects, splitCode, tokens, wovenLemmas, boldSpans } from "../src/weave-detect.ts";

export { inflects, splitCode };

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
  /** Every lemma of the target wordlist: off-list means a real target-language word, not a bold English phrase */
  lexicon?: string[];
  /** Algorithm 3: served lemmas at the familiar steps (bold, no inline translation, closing glossary line) */
  familiar?: string[];
  /** Algorithm 3: served lemmas in the nudge slot */
  nudge?: string[];
  /** Algorithm 3: known sample, offered without translations; not part of coverage */
  known?: string[];
  /** The task's output is text the user will copy or send (a post, a meeting summary) */
  deliverable?: boolean;
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
  /** Algorithm 3: nudge lemmas woven */
  nudgeWoven: string[];
  /** Algorithm 3: familiar or known lemmas written with an inline translation */
  glossedFamiliar: string[];
  /** Familiar lemmas woven, and whether a closing `word = translation` line lists them */
  familiarUsed: string[];
  glossaryLine: boolean;
  /** Known-sample lemmas used */
  knownUsed: string[];
  /** Deliverable topics: bold target words inside the deliverable (the reply minus its first and last paragraph) */
  inDeliverable: string[];
  /** Bold target-language tokens per 100 prose tokens */
  spanishShare: number;
}

const norm = (s: string) => s.normalize("NFC").toLowerCase();

const ES_FUNCTION = new Set(["el", "la", "los", "las", "es", "son", "está", "están", "un", "una", "que", "de", "del", "y", "en", "con", "muy", "mi", "tu", "su", "hay", "para", "por", "no", "me", "te", "se"]);

const matchesLemma = (token: string, lemma: string) => token.startsWith(stem(lemma));

/** Does a gloss carry the listed translation? Compares content words by prefix, so "left" ≈ "leave" fails but "houses" ≈ "house" passes. */
const IRREGULAR: Record<string, string> = { men: "man", women: "woman", children: "child", teeth: "tooth", feet: "foot", people: "person", mice: "mouse" };

export function glossMatches(given: string, listed: string): boolean {
  const want = tokens(listed).filter((t) => t.length >= 3 && t !== "the");
  const got = tokens(given).map((g) => IRREGULAR[g] ?? g);
  return want.length === 0 || want.some((w) => got.some((g) => g.startsWith(w.slice(0, 4)) || w.startsWith(g.slice(0, 4))));
}

/**
 * The part of a reply the user copies: between the first and last `---` rule when
 * the reply fences it that way, else everything but the first and last paragraph
 * (an intro like "Here's the post:" and a closing note). A heuristic: read what it flags.
 */
export function deliverableOf(prose: string): string {
  const fenced = prose.split(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m);
  if (fenced.length >= 3) return fenced.slice(1, -1).join("\n");
  if (fenced.length === 2) return fenced[0]!.trim().split(/\n\s*\n/).slice(1).join("\n\n"); // a post, then notes after one rule
  const paras = prose.trim().split(/\n\s*\n/);
  return paras.length > 2 ? paras.slice(1, -1).join("\n\n") : prose;
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
  const sentences: string[] = [];
  const lexicon = spec.lexicon ? new Set(spec.lexicon.map(norm)) : null;
  const inLexicon = (t: string) => t.length >= 3 && (lexicon!.has(t) || lexicon!.has(t.replace(/e?s$/, "")));

  const known = spec.known ?? [];
  const soft = new Set([...(spec.familiar ?? []), ...known].map(norm));
  const glossedFamiliar: string[] = [];
  for (const p of pairs) {
    const toks = tokens(p.word);
    const ruleWord = !!suffix && toks.length === 1 && toks[0]!.endsWith(suffix);
    // a rule word or a listed cognate may be spelled like its gloss by design (natural = natural, color = color)
    const cognate = spec.served.some((s) => norm(s.target) === norm(s.gloss) && toks.includes(norm(s.target)));
    if (norm(p.word) === norm(p.gloss) && !ruleWord && !cognate) selfGloss.push(`${p.word} (${p.gloss})`);
    if (toks.length >= 4) { sentence = true; sentences.push(p.word); continue; }
    const soft1 = [...soft].find((l) => toks.length === 1 && inflects(toks[0]!, l));
    if (soft1) { glossedFamiliar.push(soft1); if (spec.served.some((s) => norm(s.target) === soft1)) woven.add(spec.served.find((s) => norm(s.target) === soft1)!.target); continue; }
    const hit = spec.served.find((s) => toks.some((t) => matchesLemma(t, s.target) || inflects(t, s.target)));
    if (hit) {
      woven.add(hit.target);
      if (toks.length === 1 && !glossMatches(p.gloss, hit.gloss)) wrongGloss.push(`${p.word} (${p.gloss}) ≠ ${hit.gloss}`);
      continue;
    }
    if (ruleWord) { ruleUsed = true; continue; }
    if (!lexicon || toks.some(inLexicon)) offList.add(norm(p.word));
  }

  // off-list words bolded with no gloss at all (**dieta**, **frío**) — only countable against a lexicon
  if (lexicon) for (const m of prose.matchAll(/\*\*([^*\n]{2,30})\*\*(?!\s*\()/g)) {
    const toks = tokens(m[1]!);
    if (toks.length !== 1 || spec.served.some((s) => inflects(toks[0]!, s.target)) || known.some((k) => inflects(toks[0]!, k))) continue;
    if (suffix && toks[0]!.endsWith(suffix)) continue;
    if (inLexicon(toks[0]!)) offList.add(`${toks[0]} (no gloss)`);
  }

  // the level 7+ sentence may come italic or bold, as long as a translation follows it
  if (/(\*{1,2}|_)[^*_\n]{15,200}\1\s*\([^)\n]{10,}\)/.test(prose)) sentence = true;
  // or plain: a stretch with Spanish function words, then a translation of 4+ words in parentheses
  for (const m of prose.matchAll(/([^.!?:\n(]{12,200}[.!?]?)\s*\(([^)\n]{12,})\)/g)) {
    const fn = tokens(m[1]!.replace(/\*/g, "")).filter((t) => ES_FUNCTION.has(t)).length;
    if (fn >= 2 && tokens(m[2]!).length >= 4) { sentence = true; sentences.push(m[1]!); }
  }

  // unglossed bold counts as woven: familiar and known words come without a translation by design
  for (const t of wovenLemmas(prose, spec.served.map((s) => s.target))) woven.add(t);
  // a served word in prose that never got the bold+gloss treatment
  // words inside the Spanish sentence are its content, not unglossed weaves
  const proseTokens = tokens(sentences.reduce((acc, x) => acc.replace(x, " "), prose));
  const unformatted = spec.served
    .filter((s) => !woven.has(s.target) && proseTokens.some((t) => inflects(t, s.target)))
    .map((s) => s.target);

  const familiarUsed = (spec.familiar ?? []).filter((t) => woven.has(t));
  const lastLines = prose.trim().split("\n").slice(-3).join("\n");
  const glossaryLine = familiarUsed.length > 0 && familiarUsed.some((t) => new RegExp(`${stem(t)}\\p{L}*\\**\\s*=\\s*\\S`, "iu").test(lastLines));
  const knownUsed = wovenLemmas(prose, known);
  const lexiconOrOffered = (t: string) => (lexicon ? inLexicon(t) : false) || spec.served.some((s) => inflects(t, s.target)) || known.some((k) => inflects(t, k));
  const inner = spec.deliverable ? deliverableOf(prose) : "";
  const inDeliverable = [...new Set(boldSpans(inner).flatMap(tokens).filter(lexiconOrOffered))];
  const proseToks = tokens(prose.replace(/\*/g, ""));
  const boldToks = boldSpans(prose).flatMap(tokens).filter(lexiconOrOffered);

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
    nudgeWoven: (spec.nudge ?? []).filter((t) => woven.has(t)),
    glossedFamiliar,
    familiarUsed,
    glossaryLine,
    knownUsed,
    inDeliverable,
    spanishShare: proseToks.length ? Math.round((1000 * boldToks.length) / proseToks.length) / 10 : 0,
  };
}
