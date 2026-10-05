import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

// A stand-in for `langcouch cards ...`: two cards, a forward review and a reverse one.
const STATUS = { lang: 'it', paused: false, due: 2, known: 10, learning: 3, placementLeft: 40, total: 432 }
const CARDS = [
  { id: 'house', kind: 'review', dir: 'forward', prompt: 'casa' },
  { id: 'time', kind: 'review', dir: 'reverse', prompt: 'время' },
]
const EXPECTED: Record<string, string> = { house: 'дом', time: 'tempo' }

function fakeCli(on: On, { paused = false } = {}) {
  const calls: string[][] = []
  surfaceStubs(on)
  mock.env(on, { LANGCOUCH_CLI: '/fake/cli.sh' })
  on('process.run', async (_$, e) => {
    const args = e.argv.slice(3) // /bin/sh <cli> cards ...
    calls.push(args)
    const [sub, id = '', , , ...rest] = args
    const json = (v: unknown) => ({ value: { exitCode: 0, stdout: JSON.stringify(v), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (sub === 'status') return json({ ...STATUS, paused })
    if (sub === 'next') return json({ status: { ...STATUS, paused }, cards: paused ? [] : CARDS })
    if (sub === 'reveal') return json({ expected: EXPECTED[id] })
    const ok = sub === 'grade' ? rest[0] === 'ok' : rest.join(' ') === EXPECTED[id]
    return json({ ok, expected: EXPECTED[id], step: ok ? 2 : 0, due: '', known: false, status: { ...STATUS, due: STATUS.due - 1 } })
  })
  return calls
}

function surfaceStubs(on: On) {
  on('ui.open', async () => ({ value: { isPlaced: true } as const }))
  on('ui.close', async () => ({ value: undefined }))
  on('ui.status', async () => ({ value: undefined }))
}

const PROPS = { title: 'LangCouch cards', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} } as const
const mountOn = async <S extends RenderSurface>($: Engine, surface: S) => {
  await $.command.run({ command: 'cards', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  return $.ui.mount({ plugin: 'langcouch-cards', surface, component: 'Pane', requestId: 'langcouch-cards', props: PROPS })
}

describe('typed answers', () => {
  for (const surface of ['terminal', 'desktop', 'vscode'] as const)
    test(`${surface}: a right answer, then don't know, then the round summary`, async ($, on) => {
      const calls = fakeCli(on)
      const ui = await mountOn($, surface)
      expect(await ui.find({ type: 'Text', text: 'casa' })).toBeDefined()
      await ui.input({ key: 'answer', text: 'дом' })
      expect(await ui.find({ text: '✓ дом' })).toBeDefined()
      await ui.press({ key: 'next' })
      expect(await ui.find({ text: 'In it?' })).toBeDefined()
      await ui.press({ key: 'dontknow' })
      expect(await ui.find({ text: '✗ tempo' })).toBeDefined()
      expect(calls).toContainEqual(['answer', 'house', 'review', 'forward', 'дом'])
      expect(calls).toContainEqual(['answer', 'time', 'review', 'reverse'])
      await ui.press({ key: 'next' })
      expect(await ui.find({ text: /Round done: 1 of 2 right/ })).toBeDefined()
    })
})

test('mobile: no text field, the answer is shown and self-graded', async ($, on) => {
  const calls = fakeCli(on)
  const ui = await mountOn($, 'mobile')
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  await ui.press({ key: 'show' })
  expect(await ui.find({ text: '= дом' })).toBeDefined()
  await ui.press({ key: 'knew' })
  expect(await ui.find({ text: '✓ дом' })).toBeDefined()
  expect(calls).toContainEqual(['grade', 'house', 'review', 'forward', 'ok'])
})

test('paused LangCouch shows the pause, not cards', async ($, on) => {
  fakeCli(on, { paused: true })
  const ui = await mountOn($, 'terminal')
  expect(await ui.find({ text: /paused/ })).toBeDefined()
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
})

test('a failing CLI is an error with a retry, not a blank pane', async ($, on) => {
  surfaceStubs(on)
  mock.env(on, { LANGCOUCH_CLI: '/fake/cli.sh' })
  on('process.run', async () => ({ value: { exitCode: 1, stdout: '', stderr: 'boom', isStdoutTruncated: false, isStderrTruncated: false } }))
  const ui = await mountOn($, 'terminal')
  expect(await ui.find({ text: /could not load: boom/ })).toBeDefined()
  expect(await ui.find({ key: 'retry' })).toBeDefined()
})
