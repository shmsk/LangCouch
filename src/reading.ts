import type { Config, Word } from "./types.ts";
import { glossFor } from "./types.ts";

/**
 * Pronunciation next to new words. Each word's sound is stored once, as IPA, in
 * readings/<lang>.json; what the learner sees is rendered from it: the IPA itself, or
 * the closest spelling in their own alphabet (ru Cyrillic, en respelling, uz Latin).
 * Rendering is a longest-match table, not a phonology: good enough to say the word,
 * never a dictionary entry.
 */

export type ReadingMode = "off" | "native" | "ipa";
export const READING_MODES: readonly ReadingMode[] = ["off", "native", "ipa"];

/** The setting for a language: what the user chose, else `native` where readings exist, else off. */
export function readingOf(config: Config, lang: string, hasReadings: boolean): ReadingMode {
  if (!hasReadings) return "off";
  return config.reading?.[lang] ?? "native";
}

/** IPA as stored, cleaned for display: no slashes, syllable dots, ties or secondary stress. */
export function cleanIpa(ipa: string): string {
  return ipa
    .normalize("NFD")
    .replace(/[/[\]]/g, "")
    .replace(/[.‿ˌ͜͡]/g, "")
    .replace(/[()]/g, "")
    .normalize("NFC")
    .trim();
}

type Table = Record<string, string>;
interface Alphabet {
  vowels: Table;
  /** Two-sound vowels spelled as one (aɪ → eye in English respelling). */
  diphthongs?: Table;
  /** Vowel second halves (aɪ → ай): spelled this way right after a vowel. */
  glides: Table;
  consonants: Table;
  /** How a nasal vowel closes (ɑ̃ → ан). */
  nasal: string;
}

const RU: Alphabet = {
  vowels: { a: "а", ɑ: "а", ɒ: "о", æ: "э", ɐ: "а", ʌ: "а", e: "е", ɛ: "е", ə: "э", ɜ: "ё", ɝ: "ёр", ɚ: "эр", i: "и", ɪ: "и", ɨ: "ы", o: "о", ɔ: "о", ɤ: "о", u: "у", ʊ: "у", ʉ: "у", y: "ю", ø: "ё", œ: "ё" },
  glides: { ɪ: "й", i: "й", ʊ: "у", u: "у", ə: "э" },
  consonants: {
    tʃ: "ч", dʒ: "дж", ts: "ц", ks: "кс",
    p: "п", b: "б", t: "т", d: "д", k: "к", ɡ: "г", g: "г", f: "ф", v: "в", s: "с", z: "з", ʃ: "ш", ʒ: "ж",
    m: "м", n: "н", ɲ: "нь", ŋ: "нг", l: "л", ɫ: "л", ʎ: "ль", r: "р", ɾ: "р", ɹ: "р", ʁ: "р", ʀ: "р",
    h: "х", x: "х", χ: "х", θ: "с", ð: "з", β: "в", ɣ: "г", w: "у", ʍ: "у", ɥ: "ю", ʔ: "", c: "к", ɟ: "г", ʝ: "й", ç: "х",
  },
  nasal: "н",
};

const EN: Alphabet = {
  diphthongs: { aɪ: "eye", aj: "eye", eɪ: "ay", ej: "ay", ɛj: "ay", ɐj: "ay", ɔɪ: "oy", oj: "oy", ɔj: "oy", aʊ: "ow", aw: "ow", ɐw: "ow", oʊ: "oh", əʊ: "oh", ow: "oh", uj: "ooy" },
  vowels: { a: "ah", ɑ: "ah", ɒ: "o", æ: "a", ɐ: "uh", ʌ: "uh", e: "ay", ɛ: "eh", ə: "uh", ɜ: "ur", ɝ: "ur", ɚ: "er", i: "ee", ɪ: "ih", ɨ: "ih", o: "oh", ɔ: "aw", ɤ: "uh", u: "oo", ʊ: "uu", ʉ: "oo", y: "ew", ø: "uh", œ: "uh" },
  glides: { ɪ: "y", i: "y", ʊ: "w", u: "w", ə: "uh" },
  consonants: {
    tʃ: "ch", dʒ: "j", ts: "ts", ks: "ks",
    p: "p", b: "b", t: "t", d: "d", k: "k", ɡ: "g", g: "g", f: "f", v: "v", s: "s", z: "z", ʃ: "sh", ʒ: "zh",
    m: "m", n: "n", ɲ: "ny", ŋ: "ng", l: "l", ɫ: "l", ʎ: "ly", r: "r", ɾ: "r", ɹ: "r", ʁ: "r", ʀ: "r",
    h: "h", x: "kh", χ: "kh", θ: "th", ð: "th", β: "v", ɣ: "g", w: "w", ʍ: "w", ɥ: "w", ʔ: "", c: "k", ɟ: "g", ʝ: "y", ç: "h", j: "y",
  },
  nasal: "n",
};

const UZ: Alphabet = {
  vowels: { a: "a", ɑ: "a", ɒ: "o", æ: "e", ɐ: "a", ʌ: "a", e: "e", ɛ: "e", ə: "e", ɜ: "o", ɝ: "or", ɚ: "er", i: "i", ɪ: "i", ɨ: "i", o: "o", ɔ: "o", ɤ: "o", u: "u", ʊ: "u", ʉ: "u", y: "yu", ø: "yo", œ: "yo" },
  glides: { ɪ: "y", i: "y", ʊ: "u", u: "u", ə: "e" },
  consonants: {
    tʃ: "ch", dʒ: "j", ts: "ts", ks: "ks",
    p: "p", b: "b", t: "t", d: "d", k: "k", ɡ: "g", g: "g", f: "f", v: "v", s: "s", z: "z", ʃ: "sh", ʒ: "j",
    m: "m", n: "n", ɲ: "ny", ŋ: "ng", l: "l", ɫ: "l", ʎ: "ly", r: "r", ɾ: "r", ɹ: "r", ʁ: "r", ʀ: "r",
    h: "h", x: "x", χ: "x", θ: "s", ð: "z", β: "v", ɣ: "gʻ", w: "u", ʍ: "u", ɥ: "yu", ʔ: "ʼ", c: "k", ɟ: "g", ʝ: "y", ç: "x", j: "y",
  },
  nasal: "n",
};

const ALPHABETS: Record<string, Alphabet> = { ru: RU, en: EN, uz: UZ };

/** Russian iotated vowels: й + vowel is one letter (я, е, ё, ю). */
const RU_IOTATED: Table = { а: "я", э: "е", е: "е", о: "ё", ё: "ё", у: "ю", ю: "ю", и: "и" };

const NASAL = "̃";
const NON_SYLLABIC = "̯";
const STRESS = "ˈ";

interface Seg {
  ch: string;
  nasal: boolean;
  nonSyllabic: boolean;
  stress: boolean;
  syllable: number;
}

/** Split IPA into sound segments: base letters with their nasal / non-syllabic marks, stress and syllable index. */
function segments(ipa: string): Seg[] {
  const src = ipa.normalize("NFD").replace(/[/[\]()]/g, "").replace(/[ː͜͡‿ˌʰʲ̪̞̝̥̩̃ʷ]/g, (m) => (m === NASAL ? m : ""));
  const out: Seg[] = [];
  let syllable = 0, stress = false;
  for (const ch of src) {
    if (ch === "." || ch === " ") {
      syllable++;
      continue;
    }
    if (ch === STRESS) {
      if (out.length) syllable++;
      stress = true;
      continue;
    }
    if (ch === NASAL) {
      if (out.length) out[out.length - 1]!.nasal = true;
      continue;
    }
    if (ch === NON_SYLLABIC) {
      if (out.length) out[out.length - 1]!.nonSyllabic = true;
      continue;
    }
    if (/\p{M}/u.test(ch)) continue;
    out.push({ ch, nasal: false, nonSyllabic: false, stress, syllable });
    stress = false;
  }
  // stress marks the whole syllable that follows it
  const stressed = new Set(out.filter((s) => s.stress).map((s) => s.syllable));
  for (const s of out) s.stress = stressed.has(s.syllable);
  return out;
}

const isVowel = (a: Alphabet, s: Seg | undefined) => !!s && s.ch in a.vowels && !s.nonSyllabic;

/**
 * The reading as the learner sees it. `ipa` mode shows the cleaned IPA; `native` spells it in
 * the learner's alphabet. A learner whose native language is the target's own gets IPA.
 */
export function renderReading(ipa: string, mode: ReadingMode, native: string, lang: string): string {
  if (mode === "off") return "";
  const alphabet = ALPHABETS[native];
  if (mode === "ipa" || !alphabet || native === lang.split("-")[0]) return cleanIpa(ipa);
  const segs = segments(ipa);
  const anyStress = segs.some((s) => s.stress);
  // French has no stress mark: the last syllable carries it
  const lastSyllable = segs.length ? segs[segs.length - 1]!.syllable : 0;
  const stressedSyllable = (s: Seg) => (anyStress ? s.stress : lang.startsWith("fr") && s.syllable === lastSyllable);
  const parts: { text: string; syllable: number; stressed: boolean }[] = [];
  const push = (text: string, s: Seg) => parts.push({ text, syllable: s.syllable, stressed: stressedSyllable(s) });

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const next = segs[i + 1];
    const prev = segs[i - 1];
    const di = next && alphabet.diphthongs?.[s.ch + next.ch];
    if (di && next.syllable === s.syllable) {
      push(di, s);
      if (s.nasal || next.nasal) push(alphabet.nasal, s);
      i++;
      continue;
    }
    // affricates and clusters spelled as one letter (tʃ → ч)
    if (next && !s.nasal && alphabet.consonants[s.ch + next.ch] !== undefined) {
      push(alphabet.consonants[s.ch + next.ch]!, s);
      i++;
      continue;
    }
    if (s.ch in alphabet.vowels || s.ch in alphabet.glides) {
      const glide = (s.nonSyllabic || (isVowel(alphabet, prev) && s.ch in alphabet.glides && prev!.syllable === s.syllable)) && s.ch in alphabet.glides;
      let text = glide ? alphabet.glides[s.ch]! : alphabet.vowels[s.ch] ?? alphabet.glides[s.ch]!;
      if (native === "ru" && !glide) text = ruVowel(text, prev, parts);
      push(text, s);
      if (closesNasal(s, next)) push(nasalBefore(alphabet, next), s);
      continue;
    }
    if (s.ch === "j") {
      // ru: й before a vowel merges into it (ja → я); elsewhere й
      if (native === "ru") {
        const v = next && next.ch in RU.vowels ? RU.vowels[next.ch]! : "";
        const merged = RU_IOTATED[v[0] ?? ""];
        if (merged && v.length === 1) {
          // ji has no single letter: йи at the start, ьи after a consonant
          push(isVowel(RU, prev) || !prev ? (merged === "и" ? "йи" : merged) : `ь${merged}`, next!);
          if (closesNasal(next!, segs[i + 2])) push(nasalBefore(RU, segs[i + 2]), next!);
          i++;
          continue;
        }
        push("й", s);
      } else push(alphabet.consonants.j ?? "y", s);
      if (closesNasal(s, next)) push(alphabet.nasal, s);
      continue;
    }
    push(alphabet.consonants[s.ch] ?? s.ch, s);
    if (closesNasal(s, next)) push(alphabet.nasal, s);
  }

  if (native === "ru") return ruStress(parts);
  if (native !== "en") return parts.map((p) => p.text).join("");
  // English respelling: syllables joined by hyphens, the stressed one in capitals
  const syllables = new Map<number, { text: string; stressed: boolean }>();
  for (const p of parts) {
    const cur = syllables.get(p.syllable) ?? { text: "", stressed: false };
    syllables.set(p.syllable, { text: cur.text + p.text, stressed: cur.stressed || p.stressed });
  }
  const list = [...syllables.values()].filter((s) => s.text);
  return list.map((s) => (s.stressed && list.length > 1 ? s.text.toUpperCase() : s.text)).join("-");
}

/** A nasal sound closes with n after the last nasal segment in a row (pão = pɐ̃w̃ → паун), unless a nasal consonant follows anyway. */
const closesNasal = (s: Seg, next: Seg | undefined) => s.nasal && !next?.nasal && !(next && "mnɲŋ".includes(next.ch));

/** The closing n reads m before p and b (computador → компутадор). */
const nasalBefore = (a: Alphabet, next: Seg | undefined) => (next && "pb".includes(next.ch) ? (a === RU ? "м" : "m") : a.nasal);

/** Russian: an acute accent on the stressed vowel (по́рту), only in words of two or more syllables. */
function ruStress(parts: { text: string; syllable: number; stressed: boolean }[]): string {
  const syllables = new Set(parts.filter((p) => /[аэеёиоуыюя]/.test(p.text)).map((p) => p.syllable));
  let done = syllables.size < 2;
  return parts
    .map((p) => {
      if (done || !p.stressed) return p.text;
      const i = p.text.search(/[аэеиоуыюя]/);
      if (i < 0) return p.text;
      done = true;
      return p.text.slice(0, i + 1) + "\u0301" + p.text.slice(i + 1);
    })
    .join("")
    .normalize("NFC");
}

/** Russian е after a vowel or at the start reads as э; elsewhere е softens the consonant before it. */
function ruVowel(text: string, prev: Seg | undefined, parts: { text: string }[]): string {
  if (text !== "е" && text !== "ё") return text;
  const before = parts.length ? parts[parts.length - 1]!.text.slice(-1) : "";
  const afterVowel = !prev || /[аэеёиоуыюяй]/.test(before);
  if (text === "е") return afterVowel ? "э" : "е";
  return afterVowel ? "йо" : "ё";
}

/** A word's reading for this config, or "" when the setting is off or the word has none. */
export function readingFor(word: Word, mode: ReadingMode, native: string, lang: string): string {
  return word.ipa && mode !== "off" ? renderReading(word.ipa, mode, native, lang) : "";
}

/** Native-language label for the native mode in the question ("Russian letters"). */
const LETTERS: Record<string, string> = { ru: "Russian letters", en: "English spelling", uz: "Uzbek letters" };

/**
 * The once-per-language question: show the pronunciation of new words? Each choice comes
 * with the same real word, so "native" vs "IPA" is never abstract.
 */
export function askReadingLine(lang: string, langLabel: string, native: string, word: Word): string {
  const gloss = glossFor(word, native, lang);
  const nat = renderReading(word.ipa!, "native", native, lang);
  const ipa = renderReading(word.ipa!, "ipa", native, lang);
  const letters = LETTERS[native] ?? "your alphabet";
  return `Once, in one short line after the answer, in the user's language, ask whether new ${langLabel} words should show their pronunciation, giving these three examples verbatim: none: ${word.target} (${gloss}) · ${letters}: ${word.target} [${nat}] (${gloss}) · IPA: ${word.target} [${ipa}] (${gloss}). \`/langcouch:reading off|native|ipa\` sets it (now: ${letters}).`;
}

/** The three choices as CLI lines, with an example word; for `lang` and `reading status`. */
export function readingExamples(lang: string, native: string, word: Word): string[] {
  const gloss = glossFor(word, native, lang);
  return [
    `  off     ${word.target} (${gloss})`,
    `  native  ${word.target} [${renderReading(word.ipa!, "native", native, lang)}] (${gloss})`,
    `  ipa     ${word.target} [${renderReading(word.ipa!, "ipa", native, lang)}] (${gloss})`,
  ];
}
