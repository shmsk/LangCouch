// The flashcard as SVG, for the surfaces that draw one (desktop, VS Code, mobile): a card
// with the word big in the middle, the way Anki and Memrise show it. The terminal keeps
// its text pane. Pure string building: no DOM in the mod's environment.

import { langTag } from './lang'

const W = 320
const PAD = 20
const FONT = `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

// Light by default; the dark block applies where the host passes the color scheme through.
const STYLE = `<style>
.bg{fill:#ffffff;stroke:#e4e4e7}
.ink{fill:#18181b}.dim{fill:#71717a}.track{fill:#f4f4f5}.rule{stroke:#e4e4e7}
.review{fill:#3b82f6}.placement{fill:#8b5cf6}
.ok{fill:#16a34a}.fail{fill:#dc2626}
.ring-ok{stroke:#16a34a}.ring-track{stroke:#f4f4f5}
@media (prefers-color-scheme: dark){
.bg{fill:#18181b;stroke:#3f3f46}
.ink{fill:#fafafa}.dim{fill:#a1a1aa}.track{fill:#27272a}.rule{stroke:#3f3f46}
.ok{fill:#4ade80}.fail{fill:#f87171}
.ring-ok{stroke:#4ade80}.ring-track{stroke:#27272a}
}
</style>`

/** XML-escape text for an SVG text node or attribute. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** A font size that keeps `text` on one line inside `width` px: big for short words, shrinking for long ones. */
export function fitSize(text: string, width: number, max: number, min: number): number {
  const len = [...text].length || 1
  return Math.max(min, Math.min(max, Math.floor(width / (len * 0.6))))
}

const svg = (h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" font-family="${FONT}">${STYLE}` +
  `<rect class="bg" x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="16"/>${body}</svg>`

const text = (x: number, y: number, cls: string, size: number, s: string, extra = '') =>
  `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" ${extra}>${esc(s)}</text>`

export type CardFace = {
  kind: 'review' | 'placement'
  /** 0-based card index and round length */
  index: number
  total: number
  lang: string
  /** The language the prompt is in (the learner's on a reverse card): its flag and name in the corner. */
  promptLang?: string
  prompt: string
  /** The prompt's pronunciation, shown under it (forward cards, when the learner has it on). */
  reading?: string
  ask: string
  /** The answer side: after a graded answer (`ok` set) or a reveal (`ok` undefined). */
  answer?: { expected: string; ok?: boolean; typed?: string }
}

const CARD_HEIGHT = 230

/** The corner label: 🇮🇹 ITALIANO for the prompt's language, the target code when it is unknown. */
const corner = (c: CardFace) => {
  if (!c.promptLang) return c.lang.toUpperCase()
  const { flag, name } = langTag(c.promptLang)
  return `${flag} ${name.toUpperCase()}`
}

/** One card: progress bar, kind and position, the prompt big, then the answer under a rule. */
export function cardSvg(c: CardFace): string {
  const inner = W - 2 * PAD
  const done = c.index + (c.answer?.ok !== undefined ? 1 : 0)
  const bar = Math.round((inner * Math.min(done, c.total)) / Math.max(c.total, 1))
  const label = `${c.kind === 'placement' ? 'PLACEMENT' : 'REVIEW'} · ${c.index + 1}/${c.total}`
  let body =
    `<rect class="track" x="${PAD}" y="${PAD}" width="${inner}" height="4" rx="2"/>` +
    (bar > 0 ? `<rect class="${c.kind}" x="${PAD}" y="${PAD}" width="${bar}" height="4" rx="2"/>` : '') +
    text(PAD, 46, 'dim', 11, label, 'font-weight="600" letter-spacing="1"') +
    text(W - PAD, 46, 'dim', 11, corner(c), 'font-weight="600" letter-spacing="1" text-anchor="end"')

  const promptY = c.answer ? 100 : 118
  body += text(W / 2, promptY, 'ink', fitSize(c.prompt, inner, 40, 16), c.prompt, 'font-weight="700" text-anchor="middle"')
  if (c.reading) {
    // the pronunciation takes the line under the word; the ask moves down, or yields to the answer
    body += text(W / 2, promptY + 24, 'dim', fitSize(`[${c.reading}]`, inner, 15, 10), `[${c.reading}]`, 'text-anchor="middle"')
    if (!c.answer) body += text(W / 2, promptY + 44, 'dim', 13, c.ask, 'text-anchor="middle"')
  } else body += text(W / 2, promptY + 26, 'dim', 13, c.ask, 'text-anchor="middle"')

  if (c.answer) {
    const { expected, ok, typed } = c.answer
    const cls = ok === undefined ? 'ink' : ok ? 'ok' : 'fail'
    const mark = ok === undefined ? '' : ok ? '✓ ' : '✗ '
    body += `<line class="rule" x1="${PAD}" y1="146" x2="${W - PAD}" y2="146" stroke-width="1"/>`
    body += text(W / 2, 182, cls, fitSize(mark + expected, inner, 24, 12), mark + expected, 'font-weight="600" text-anchor="middle"')
    if (ok === false && typed) body += text(W / 2, 206, 'dim', fitSize(`you wrote: ${typed}`, inner, 12, 9), `you wrote: ${typed}`, 'text-anchor="middle"')
  }
  return svg(CARD_HEIGHT, body)
}

export type RoundSummary = { right: number; total: number; due: number; known: number; left: number }

/** The end of a round: the score as a ring, then what is due, known and left to place. */
export function doneSvg(r: RoundSummary): string {
  const h = 230
  const cx = W / 2
  const cy = 88
  const rad = 52
  const circ = 2 * Math.PI * rad
  const share = r.total > 0 ? r.right / r.total : 0
  const ring =
    `<circle class="ring-track" cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke-width="10"/>` +
    (share > 0
      ? `<circle class="ring-ok" cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke-width="10" stroke-linecap="round" ` +
        `stroke-dasharray="${(circ * share).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`
      : '')
  const score = text(cx, cy + 4, 'ink', 30, `${r.right}/${r.total}`, 'font-weight="700" text-anchor="middle"') +
    text(cx, cy + 24, 'dim', 11, 'right', 'text-anchor="middle"')
  const stat = (x: number, n: number, what: string) =>
    text(x, 190, 'ink', 20, String(n), 'font-weight="700" text-anchor="middle"') + text(x, 208, 'dim', 11, what, 'text-anchor="middle"')
  const col = (W - 2 * PAD) / 3
  return svg(h, ring + score + stat(PAD + col / 2, r.due, 'due') + stat(PAD + col * 1.5, r.known, 'known') + stat(PAD + col * 2.5, r.left, 'to place'))
}
