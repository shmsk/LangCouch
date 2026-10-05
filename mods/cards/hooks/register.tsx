import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Card, CardResult, CardStatus, CardsView } from '../types'

// The mod draws; the LangCouch CLI picks, grades and records every card
// (`langcouch cards ...`, JSON out), so progress lives in one place: ~/.langcouch.
const PANE = 'langcouch-cards'
const ROUND = 10
const view = atom({ plugin: 'langcouch', key: 'view' } as const, { phase: 'loading' } as CardsView)

type Engine = EngineInterface

/** Where the LangCouch CLI is: an override, the langcouch plugin this mod ships in, a checkout, or the installed plugin. */
async function findCli($: Engine): Promise<string> {
  const exists = async (path: string) => {
    try {
      await $.fs.read(path)
      return true
    } catch {
      return false
    }
  }
  const override = await $.env.get('LANGCOUCH_CLI')
  if (override) return override
  for (const local of [`${$.plugin.root}/scripts/cli.sh`, `${$.plugin.root}/../../scripts/cli.sh`])
    if (await exists(local)) return local
  const home = await $.env.get('HOME')
  if (home) {
    try {
      const installed = JSON.parse(await $.fs.read(`${home}/.claude/plugins/installed_plugins.json`)) as {
        plugins?: Record<string, { installPath?: string }[]>
      }
      for (const [name, entries] of Object.entries(installed.plugins ?? {}))
        if (name.startsWith('langcouch@'))
          for (const entry of entries)
            if (entry.installPath && (await exists(`${entry.installPath}/scripts/cli.sh`))) return `${entry.installPath}/scripts/cli.sh`
    } catch {
      // no plugin registry: fall through to the error below
    }
  }
  throw new Error('LangCouch is not installed. Install the langcouch plugin first (/plugin), or set LANGCOUCH_CLI to its scripts/cli.sh.')
}

async function cards<T>($: Engine, args: string[]): Promise<T> {
  const cli = await findCli($)
  const { exitCode, stdout, stderr } = await $.process.run(['/bin/sh', cli, 'cards', ...args])
  if (exitCode !== 0) throw new Error(stderr.trim() || `langcouch cards ${args[0]} failed (exit ${exitCode})`)
  return JSON.parse(stdout) as T
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function showStatus($: Engine, status: CardStatus) {
  $.ui.status(status.paused || status.due === 0 ? undefined : `🃏 ${status.due} due`)
}

async function start($: Engine) {
  await update($, view, (): CardsView => ({ phase: 'loading' }))
  try {
    const { status, cards: list } = await cards<{ status: CardStatus; cards: Card[] }>($, ['next', String(ROUND)])
    await showStatus($, status)
    await update($, view, (): CardsView => {
      if (status.paused) return { phase: 'paused' }
      if (list.length === 0) return { phase: 'empty', status }
      return { phase: 'card', cards: list, index: 0, right: 0, status }
    })
  } catch (err) {
    await update($, view, (): CardsView => ({ phase: 'error', message: message(err) }))
  }
}

/** Record a result (typed or self-graded) and move to the `result` phase. */
async function record($: Engine, args: string[]) {
  const v = await read($, view)
  if (v.phase !== 'card' && v.phase !== 'revealed') return
  try {
    const res = await cards<CardResult & { status: CardStatus }>($, args)
    const { status, ...last } = res
    await showStatus($, status)
    await update($, view, (): CardsView => ({ ...v, phase: 'result', last, status, right: v.right + (last.ok ? 1 : 0) }))
  } catch (err) {
    await update($, view, (): CardsView => ({ phase: 'error', message: message(err) }))
  }
}

async function answer($: Engine, text: string) {
  const v = await read($, view)
  if (v.phase !== 'card') return
  const card = v.cards[v.index]!
  const typed = text.trim()
  await record($, ['answer', card.id, card.kind, card.dir, ...(typed ? [typed] : [])])
}

async function reveal($: Engine) {
  const v = await read($, view)
  if (v.phase !== 'card') return
  const card = v.cards[v.index]!
  try {
    const { expected } = await cards<{ expected: string }>($, ['reveal', card.id, card.dir])
    await update($, view, (): CardsView => ({ ...v, phase: 'revealed', expected }))
  } catch (err) {
    await update($, view, (): CardsView => ({ phase: 'error', message: message(err) }))
  }
}

async function grade($: Engine, ok: boolean) {
  const v = await read($, view)
  if (v.phase !== 'revealed') return
  const card = v.cards[v.index]!
  await record($, ['grade', card.id, card.kind, card.dir, ok ? 'ok' : 'fail'])
}

async function advance($: Engine) {
  await update($, view, (v): CardsView => {
    if (v.phase !== 'result') return v
    const index = v.index + 1
    return index < v.cards.length ? { ...v, phase: 'card', index, last: undefined, expected: undefined } : { ...v, phase: 'done' }
  })
}

const ask = (card: Card, lang: string) =>
  card.kind === 'placement' ? 'Do you know this one? Translate it.' : card.dir === 'reverse' ? `In ${lang}?` : 'Translate:'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cards', description: 'Review LangCouch words as flashcards (due words first, then placement)' })
    void cards<CardStatus>($, ['status']).then(
      status => showStatus($, status),
      () => undefined, // LangCouch missing or broken: /cards says why when opened
    )
    return next(e)
  })

  on('command.run', { command: 'cards' }, async $ => {
    await $.ui.open({ id: PANE, title: 'LangCouch cards', focus: true, closeOnEscape: true })
    void start($)
    return { text: 'LangCouch cards opened. Esc closes them.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const Input = e.surface === 'mobile' ? undefined : $.ui.resolve(e).Input
    const v = await read($, view)
    const close = () => void $.ui.close({ id: PANE })

    if (v.phase === 'loading') return <Text dimColor>Loading cards…</Text>
    if (v.phase === 'error')
      return (
        <Box flexDirection="column">
          <Text>Cards could not load: {v.message}</Text>
          <Button key="retry" variant="primary" autoFocus onPress={() => void start($)}>Try again</Button>
        </Box>
      )
    if (v.phase === 'paused')
      return (
        <Box flexDirection="column">
          <Text>LangCouch is paused. /langcouch:resume turns it back on.</Text>
          <Button key="close" role="dismiss" autoFocus onPress={close}>Close</Button>
        </Box>
      )
    if (v.phase === 'empty')
      return (
        <Box flexDirection="column">
          <Text>Nothing to review right now: {v.status.known} of {v.status.total} words known.</Text>
          <Text dimColor>Words come back here when they are due.</Text>
          <Button key="close" role="dismiss" autoFocus onPress={close}>Close</Button>
        </Box>
      )
    if (v.phase === 'done')
      return (
        <Box flexDirection="column">
          <Text bold>Round done: {v.right} of {v.cards.length} right.</Text>
          <Text dimColor>
            {v.status.due} due · {v.status.known} known · {v.status.placementLeft} left to place
          </Text>
          <Box flexDirection="row" gap={1}>
            <Button key="again" variant="primary" autoFocus onPress={() => void start($)}>Another round</Button>
            <Button key="close" role="dismiss" onPress={close}>Close</Button>
          </Box>
        </Box>
      )

    const card = v.cards[v.index]!
    const header = (
      <Text dimColor>
        {card.kind === 'placement' ? 'Placement' : 'Review'} · {v.index + 1}/{v.cards.length} · {v.status.lang}
      </Text>
    )

    if (v.phase === 'result') {
      const last = v.last!
      return (
        <Box flexDirection="column">
          {header}
          <Text bold>{card.prompt}</Text>
          <Text>{last.ok ? `✓ ${last.expected}` : `✗ ${last.expected}`}</Text>
          {last.known && card.kind === 'placement' && <Text dimColor>Marked known: it skips the new-word stage.</Text>}
          <Button key="next" variant="primary" autoFocus onPress={() => void advance($)}>
            {v.index + 1 < v.cards.length ? 'Next' : 'Finish'}
          </Button>
        </Box>
      )
    }

    if (v.phase === 'revealed')
      return (
        <Box flexDirection="column">
          {header}
          <Text bold>{card.prompt}</Text>
          <Text>= {v.expected}</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="knew" variant="primary" onPress={() => void grade($, true)}>Knew it</Button>
            <Button key="didnt" onPress={() => void grade($, false)}>Didn't</Button>
          </Box>
        </Box>
      )

    return (
      <Box flexDirection="column">
        {header}
        <Text bold>{card.prompt}</Text>
        <Text dimColor>{ask(card, v.status.lang)}</Text>
        {Input ? (
          <Box flexDirection="column">
            <Input key="answer" placeholder="Enter on empty = don't know" submitLabel="check" autoFocus onSubmit={text => void answer($, text)} />
            <Button key="dontknow" dimColor onPress={() => void answer($, '')}>Don't know</Button>
          </Box>
        ) : (
          <Button key="show" variant="primary" onPress={() => void reveal($)}>Show answer</Button>
        )}
      </Box>
    )
  })
}
