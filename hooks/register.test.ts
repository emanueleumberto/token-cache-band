import { test, expect } from 'claude-code/testing'

const PLUGIN = 'token-cache-band'
const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const usage = (input: number, output: number, cacheRead: number, cacheWrite: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
  model: 'test-model',
})

const turn = (id: string, extra: Record<string, unknown> = {}) => ({
  answer: '',
  durationMs: 1,
  isAborted: false,
  turnId: id,
  reason: 'answer' as const,
  ...extra,
})

const SURFACES = ['terminal', 'desktop'] as const

// Il fondo della catena: il motore risponde con un testo vuoto.
// ui.render: se il plugin cede (next), il motore disegna una Box vuota.
const bottom = (on: any) => {
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, {})
  })
}

test('dopo un turno la banda mostra ultimo turno e sessione', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.length).toBe(2)
    expect(texts[0]).toContain('Ultimo turno')
    expect(texts[0]).toContain('hit 90%')
    expect(texts[1]).toContain('Sessione (1 turno)')
    await ui.unmount()
  }
})

test('due turni si sommano e il plurale è corretto', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))
  await $.turn.complete(turn('t2', { usage: usage(100, 150, 0, 100) }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  // Ultimo turno: solo il secondo (nessuna lettura di cache, hit 0%).
  expect(texts[0]).toContain('in 100')
  expect(texts[0]).toContain('out 150')
  expect(texts[0]).toContain('hit 0%')
  // Sessione: in 200, out 200, cache letta 900, scritta 100, hit 900/1200 = 75%.
  expect(texts[1]).toContain('Sessione (2 turni)')
  expect(texts[1]).toContain('in 200')
  expect(texts[1]).toContain('out 200')
  expect(texts[1]).toContain('cache letta 900')
  expect(texts[1]).toContain('cache scritta 100')
  expect(texts[1]).toContain('hit 75%')
  await ui.unmount()
})

test('i subagenti sono ignorati di default', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(10, 10, 0, 0) }))
  await $.turn.complete(turn('t2', { agentId: 'sub-1', usage: usage(5000, 5000, 0, 0) }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[1]).toContain('Sessione (1 turno)')
  expect(texts[1]).toContain('in 10')
  await ui.unmount()
})

test('con includeSubagents i subagenti entrano nei totali ma non in "ultimo turno"', { options: { includeSubagents: true } }, async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(10, 10, 0, 0) }))
  await $.turn.complete(turn('t2', { agentId: 'sub-1', usage: usage(990, 990, 0, 0) }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[0]).toContain('in 10 ')
  expect(texts[1]).toContain('Sessione (2 turni)')
  expect(texts[1]).toContain('in 1.0k')
  await ui.unmount()
})

test('un turno senza usage non altera le statistiche', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 0, 0) }))
  await $.turn.complete(turn('t2', { reason: 'aborted', isAborted: true }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[1]).toContain('Sessione (1 turno)')
  await ui.unmount()
})

test('prima del primo turno la banda non compare', async ($, on) => {
  bottom(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text' })).length).toBe(0)
  await ui.unmount()
})

test('con un sondaggio attivo la banda cede il posto', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 0, 0) }))
  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
    surface: 'terminal',
  })
  expect((await ui.findAll({ type: 'Text' })).length).toBe(0)
  await ui.unmount()
})

test('con prompt a zero token la percentuale di hit è 0%', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(0, 5, 0, 0) }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[0]).toContain('hit 0%')
  await ui.unmount()
})
