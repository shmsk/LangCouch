/**
 * Which language the weave's translations are in, read from the prompt the user just wrote.
 *
 * By script, not by dictionaries: Russian-alphabet Cyrillic means Russian, Latin means the
 * user's own `native` when that is a Latin-script language, else English. Telling Uzbek from
 * English by words would misfire on short prompts; the config already says which of the two
 * this user reads. Words are counted, not letters, after dropping what was pasted rather than
 * written (code, paths, identifiers, stack traces), so «посмотри useEffectDependencies» is Russian.
 */

/** Gloss languages the wordlists carry, by the script they are written in. */
const SCRIPT_OF: Record<string, "Latn" | "Cyrl"> = { en: "Latn", uz: "Latn", ru: "Cyrl" };

/** The Russian alphabet; any other Cyrillic letter means another language (Ukrainian, Serbian, Kazakh…). */
const RUSSIAN_LETTER = /^[а-яёА-ЯЁ]$/;
/** Letters of Uzbek Cyrillic that Russian lacks. */
const UZBEK_CYRILLIC = /[қғҳўҚҒҲЎ]/;

/**
 * Share of words that must be Cyrillic. Low on purpose: Russian prompts are full of English terms and
 * pasted English output with a Russian question («…your paid subscription -- ты же сам написал?»),
 * while English prompts almost never carry Cyrillic. Measured 2026-10-01 on 229 real prompts: none
 * fell between 0% and 10%, and every one between 10% and 50% was a Russian message.
 */
const CYRILLIC_SHARE = 0.1;
const MIN_LETTERS = 3;
/** Below this, an unreadable prompt ("ok", "👍") isn't worth asking about. */
const ASK_MIN_LETTERS = 10;

export interface GlossChoice {
  lang: string;
  /** Why no script settled it ("short": too little text, "unknown": a script or mix we can't map); null when settled */
  unsure: null | "short" | "unknown";
}

/** Drop what the user pasted rather than wrote: code, links, paths, mentions, identifiers, stack-trace lines. */
function ownText(prompt: string): string {
  return prompt
    .replace(/(```|~~~)[\s\S]*?(\1|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/^\s*at\s.*$/gm, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .split(/\s+/)
    .filter((t) => !/[\/\\@#_0-9]/.test(t) && !/\p{L}\.\p{L}/u.test(t) && !/\p{Ll}\p{Lu}/u.test(t))
    .join(" ");
}

export function promptGlossLang(prompt: string, native: string): GlossChoice {
  const nativeBase = native.split("-")[0]!;
  const text = ownText(prompt);
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < MIN_LETTERS) return { lang: native, unsure: "short" };
  const unknown: GlossChoice = { lang: native, unsure: letters.length >= ASK_MIN_LETTERS ? "unknown" : "short" };

  const words = text.match(/\p{L}+/gu) ?? [];
  const cyrillic = words.filter((w) => /\p{Script=Cyrillic}/u.test(w)).length;
  const latin = words.filter((w) => /\p{Script=Latin}/u.test(w)).length;
  if (cyrillic > 0 && cyrillic / (cyrillic + latin) >= CYRILLIC_SHARE) {
    const cyrLetters = letters.filter((c) => /\p{Script=Cyrillic}/u.test(c));
    if (cyrLetters.every((c) => RUSSIAN_LETTER.test(c))) return { lang: "ru", unsure: null };
    if (nativeBase === "uz" && UZBEK_CYRILLIC.test(text)) return { lang: native, unsure: null };
    return unknown;
  }
  if (latin > 0 && latin >= words.length / 2) {
    return { lang: SCRIPT_OF[nativeBase] === "Latn" ? native : "en", unsure: null };
  }
  return unknown;
}

/** Shown once, when the prompt's language couldn't be read and the user never picked one. */
export function askNativeLine(nativeName: string): string {
  return `Translations are in ${nativeName}: Lazy Polyglot couldn't tell this message's language. Once, in one short line after the answer, ask which language the user wants translations in (English, Russian or Uzbek); \`lazy-polyglot native <en|ru|uz>\` sets it.`;
}

export const GLOSS_LANGS = Object.keys(SCRIPT_OF);
