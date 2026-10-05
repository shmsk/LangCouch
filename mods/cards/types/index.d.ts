export type CardDir = 'forward' | 'reverse'
export type CardKind = 'review' | 'placement'

/** One card as `langcouch cards next` returns it. */
export type Card = { id: string; kind: CardKind; dir: CardDir; prompt: string }

/** `langcouch cards status`, also carried by `next` and every answer. */
export type CardStatus = {
  lang: string
  paused: boolean
  due: number
  known: number
  learning: number
  placementLeft: number
  total: number
  /** The due count in the status line: chosen on/off, or null = never asked (the done screen asks once). */
  statusLine?: boolean | null
}

/** What an answer came to: the right answer is shown after a hit and a miss alike. */
export type CardResult = { ok: boolean; expected: string; step: number; due: string; known: boolean; undo?: { state: Record<string, unknown>; skipped: string[] } }

/**
 * The pane's view. `card`: asking; `revealed`: a self-graded card shows its answer
 * (surfaces without a text field); `result`: graded; `done`: the round is over.
 */
export type CardsView =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'paused' }
  | { phase: 'empty'; status: CardStatus }
  | { phase: 'card' | 'revealed' | 'result' | 'done'; cards: Card[]; index: number; right: number; status: CardStatus; expected?: string; last?: CardResult; typed?: string }

declare module 'claude-code' {
  interface PluginState {
    langcouch: { view: CardsView }
  }
}
