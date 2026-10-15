import { test, expect } from 'claude-code/testing'

const PLUGIN = 'token-cache-band'
const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 140,
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


// Testo di una riga della banda (Box con key 'last' o 'total'), figli annidati compresi.
const flatten = (node: any): string =>
  typeof node === 'string' ? node : (node?.children ?? []).map(flatten).join('')
const rows = async (ui: any): Promise<[string, string]> => [
  flatten(await ui.find({ key: 'last' })),
  flatten(await ui.find({ key: 'total' })),
]

const SURFACES = ['terminal', 'desktop'] as const

// Il fondo della catena: il motore risponde con un testo vuoto.
// ui.render: se il plugin cede (next), il motore disegna una Box vuota.
const bottom = (on: any) => {
  on('turn.complete', () => ({ text: '' }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
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
    const texts = await rows(ui)
    expect(texts[0]).toContain('Ultimo turno')
    expect(texts[0]).toContain('Cache hit: █████████░ 90%')
    expect(texts[1]).toContain('Sessione · 1 turno')
    await ui.unmount()
  }
})

test('due turni si sommano e il plurale è corretto', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))
  await $.turn.complete(turn('t2', { usage: usage(100, 150, 0, 100) }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await rows(ui)
  // Ultimo turno: solo il secondo (nessuna lettura di cache, hit 0%).
  expect(texts[0]).toContain('Input: 100')
  expect(texts[0]).toContain('Output: 150')
  expect(texts[0]).toContain('Cache hit: ░░░░░░░░░░ 0%')
  // Sessione: in 200, out 200, cache letta 900, scritta 100, hit 900/1200 = 75%.
  expect(texts[1]).toContain('Sessione · 2 turni')
  expect(texts[1]).toContain('Input: 200')
  expect(texts[1]).toContain('Output: 200')
  expect(texts[1]).toContain('Cache letta: 900')
  expect(texts[1]).toContain('Cache scritta: 100')
  expect(texts[1]).toContain('Cache hit: ████████░░ 75%')
  await ui.unmount()
})

test('i subagenti sono ignorati di default', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(10, 10, 0, 0) }))
  await $.turn.complete(turn('t2', { agentId: 'sub-1', usage: usage(5000, 5000, 0, 0) }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await rows(ui)
  expect(texts[1]).toContain('Sessione · 1 turno')
  expect(texts[1]).toContain('Input: 10')
  await ui.unmount()
})

test('con includeSubagents i subagenti entrano nei totali ma non in "ultimo turno"', { options: { includeSubagents: true } }, async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(10, 10, 0, 0) }))
  await $.turn.complete(turn('t2', { agentId: 'sub-1', usage: usage(990, 990, 0, 0) }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await rows(ui)
  expect(/Input: 10(?!\d)/.test(texts[0])).toBe(true)
  // Il conteggio separa i turni del thread principale da quelli dei subagenti.
  expect(texts[1]).toContain('Sessione · 1 turno + 1 sub')
  expect(texts[1]).toContain('Input: 1k')
  await ui.unmount()
})

test('con includeSubagents, se il primo turno è di un subagente "ultimo turno" non compare', { options: { includeSubagents: true } }, async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { agentId: 'sub-1', usage: usage(500, 20, 0, 0) }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await rows(ui)
  expect(texts[0]).toBe('')
  expect(texts[1]).toContain('Sessione · 0 turni + 1 sub')
  expect(texts[1]).toContain('Input: 500')
  await ui.unmount()
})

test('senza includeSubagents un turno di subagente da solo non fa comparire la banda', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { agentId: 'sub-1', usage: usage(500, 20, 0, 0) }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text' })).length).toBe(0)
  await ui.unmount()
})

test('con la trascrizione di un agente aperta la banda mostra i suoi conteggi', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(10, 10, 0, 0) }))
  await $.turn.complete(turn('t2', { agentId: 'sub-1', usage: usage(300, 40, 700, 0) }))
  await $.turn.complete(turn('t3', { agentId: 'sub-1', usage: usage(100, 60, 900, 0) }))

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, view: { agentId: 'sub-1' } }, surface: 'terminal' })
  const texts = await rows(ui)
  expect(texts[0]).toContain('Input: 100')
  expect(texts[1]).toContain('Agente · 2 turni')
  expect(texts[1]).toContain('Input: 400')
  expect(texts[1]).toContain('Cache letta: 1.6k')
  await ui.unmount()
})

test('un agente senza turni contati non mostra la banda', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(10, 10, 0, 0) }))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, view: { agentId: 'sub-9' } }, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text' })).length).toBe(0)
  await ui.unmount()
})

test('i valori grandi usano k e M senza ".0" finale', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(1_250_000, 999_949, 2_000, 999_950) }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const [last] = await rows(ui)
  expect(last).toContain('Input: 1.3M')
  expect(last).toContain('Output: 999.9k')
  expect(last).toContain('Cache letta: 2k')
  expect(last).toContain('Cache scritta: 1M')
  await ui.unmount()
})

test('un turno senza usage non altera le statistiche', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 0, 0) }))
  await $.turn.complete(turn('t2', { reason: 'aborted', isAborted: true }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await rows(ui)
  expect(texts[1]).toContain('Sessione · 1 turno')
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

test('la banda ha la cornice e la barra del cache hit', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const frame = await ui.find({ type: 'Box' })
  expect(frame?.props.borderStyle).toBe('round')
  expect((await rows(ui))[0]).toContain('Cache hit: █████████░ 90%')
  await ui.unmount()
})

test('stretta e bassa: niente cornice, barra ed etichette lunghe', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))
  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, maxRows: 2, bodyColumns: 60 },
    surface: 'terminal',
  })
  const frame = await ui.find({ type: 'Box' })
  expect(frame?.props.borderStyle).toBe(undefined)
  const [last] = await rows(ui)
  expect(last).toContain('In: 100')
  expect(last).toContain('Letta: 900')
  expect(last).toContain('Hit: 90%')
  expect(last.includes('█')).toBe(false)
  expect(last.includes('Cache letta')).toBe(false)
  await ui.unmount()
})

test('larghezza media: etichette corte ma barra presente', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 120 }, surface: 'terminal' })
  const [last] = await rows(ui)
  expect(last).toContain('Out: 50')
  expect(last).toContain('Hit: █████████░ 90%')
  await ui.unmount()
})

test('con prompt a zero token la percentuale di hit è 0%', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(0, 5, 0, 0) }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await rows(ui)
  expect(texts[0]).toContain('Cache hit: ░░░░░░░░░░ 0%')
  await ui.unmount()
})

// Misura della sessione come la manda il motore dopo un turno principale.
const measure = (tokens: number | undefined, window: number, percent: number | undefined) => ({
  context: { tokens, window, percent },
  rateLimits: [],
  changed: ['context' as const],
})
const contextRow = async (ui: any) => flatten(await ui.find({ key: 'context' }))

test('dopo la misura compare la riga del contesto', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))
  await $.session.measure(measure(84_000, 200_000, 42))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = await contextRow(ui)
    expect(text).toContain('Contesto')
    expect(text).toContain('Usato: 84k / 200k')
    expect(text).toContain('Riempimento: ████░░░░░░ 42%')
    await ui.unmount()
  }
})

test('il contesto usa la finestra da 1M e le etichette corte su schermi stretti', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))
  await $.session.measure(measure(850_000, 1_000_000, 85))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 60 }, surface: 'terminal' })
  const text = await contextRow(ui)
  expect(text).toContain('Usato: 850k / 1M')
  expect(text).toContain('Pieno: 85%')
  expect(text.includes('█')).toBe(false)
  await ui.unmount()
})

test('senza misura, o dopo un compact, la riga del contesto non compare', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { usage: usage(100, 50, 900, 0) }))
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await contextRow(ui)).toBe('')
  await ui.unmount()

  await $.session.measure(measure(84_000, 200_000, 42))
  await $.session.measure(measure(undefined, 200_000, undefined))
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await contextRow(ui)).toBe('')
  expect((await rows(ui))[1]).toContain('Sessione · 1 turno')
  await ui.unmount()
})

test('nella vista di un agente la riga del contesto non compare', async ($, on) => {
  bottom(on)
  await $.turn.complete(turn('t1', { agentId: 'sub-1', usage: usage(300, 40, 700, 0) }))
  await $.session.measure(measure(84_000, 200_000, 42))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, view: { agentId: 'sub-1' } }, surface: 'terminal' })
  expect((await rows(ui))[1]).toContain('Agente · 1 turno')
  expect(await contextRow(ui)).toBe('')
  await ui.unmount()
})
