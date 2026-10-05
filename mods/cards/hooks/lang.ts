// Which language a word on the card is in: a flag and the language's own name. "natural" reads
// the same in Spanish and English; the tag says which one this is. The name is there because
// some terminals (Warp) draw a flag as two boxed letters.

import type { Card } from '../types'

export type LangTag = { flag: string; name: string }

const TAGS: Record<string, LangTag> = {
  it: { flag: '🇮🇹', name: 'Italiano' },
  es: { flag: '🇪🇸', name: 'Español' },
  'es-419': { flag: '🇲🇽', name: 'Español (LatAm)' },
  fr: { flag: '🇫🇷', name: 'Français' },
  de: { flag: '🇩🇪', name: 'Deutsch' },
  pt: { flag: '🇵🇹', name: 'Português' },
  'pt-br': { flag: '🇧🇷', name: 'Português (Brasil)' },
  tr: { flag: '🇹🇷', name: 'Türkçe' },
  en: { flag: '🇺🇸', name: 'English' },
  'en-gb': { flag: '🇬🇧', name: 'English (UK)' },
  ru: { flag: '🇷🇺', name: 'Русский' },
  uz: { flag: '🇺🇿', name: 'Oʻzbek' },
}

/** The tag for a language code: the exact code first (pt-BR), then its base (pt); 🌐 and the code otherwise. */
export function langTag(lang: string): LangTag {
  const code = lang.toLowerCase()
  return TAGS[code] ?? TAGS[code.split('-')[0]!] ?? { flag: '🌐', name: lang }
}

/**
 * The languages of a card's two sides. A reverse card asks in the learner's language;
 * `native` is undefined when an older CLI didn't send it, and that side gets no tag.
 */
export function cardLangs(card: Pick<Card, 'dir'>, lang: string, native: string | undefined): { prompt?: string; answer?: string } {
  return card.dir === 'reverse' ? { prompt: native, answer: lang } : { prompt: lang, answer: native }
}
