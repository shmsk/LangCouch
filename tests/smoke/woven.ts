/** Pure helpers for the live smoke check: did a reply weave words LangCouch served? */

/** Every **bold** (gloss) pair in a reply, in the format the weave instruction asks for. */
export function wovenPairs(reply: string): { word: string; gloss: string }[] {
  return [...reply.matchAll(/\*\*([^*\n]{1,40})\*\*\s*\(([^)\n]{1,60})\)/g)].map((m) => ({
    word: m[1]!.trim(),
    gloss: m[2]!.trim(),
  }));
}

/**
 * Stem that still matches inflected forms: drop a final vowel on lemmas of 4+
 * letters, so casa → cas matches casas, niño → niñ matches niños/niña.
 * Short lemmas stay whole (día matches días, año matches años).
 */
export function stem(lemma: string): string {
  const w = lemma.normalize("NFC").toLowerCase();
  return w.length >= 4 && /[aeiouáéíóú]$/.test(w) ? w.slice(0, -1) : w;
}

/** Served lemmas that appear, inflected or not, as a bold woven word in the reply. */
export function matchServed(reply: string, served: string[]): string[] {
  const bold = wovenPairs(reply).flatMap((p) => p.word.normalize("NFC").toLowerCase().split(/\s+/));
  return served.filter((lemma) => {
    const s = stem(lemma);
    return bold.some((token) => token.startsWith(s));
  });
}
