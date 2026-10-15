import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Context, Counts, Stats, Thread } from '../types'

// Chiave nuova (era 'stats'): la forma dei dati è cambiata e lo stato di sessione sopravvive ai reload.
const stats = atom({ plugin: 'token-cache-band', key: 'threads' } as const, null)
// Riempimento del contesto del thread principale, come lo legge la status line.
const context = atom({ plugin: 'token-cache-band', key: 'context' } as const, null)

const zero: Counts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const emptyThread: Thread = { last: null, total: zero, turns: 0 }
const add = (a: Counts, b: Counts): Counts => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})
const record = (t: Thread, turn: Counts): Thread => ({ last: turn, total: add(t.total, turn), turns: t.turns + 1 })

// 999 → "999", 1500 → "1.5k", 2000 → "2k", 1_250_000 → "1.3M". Sotto 999.950 restano in k, così non compare "1000.0k".
const trimZero = (s: string) => s.replace(/\.0$/, '')
const fmt = (n: number) =>
  n < 1000 ? String(n) : n < 999_950 ? `${trimZero((n / 1000).toFixed(1))}k` : `${trimZero((n / 1_000_000).toFixed(1))}M`
const hitRate = (c: Counts) => {
  const prompt = c.input + c.cacheRead + c.cacheWrite
  return prompt === 0 ? 0 : Math.round((c.cacheRead / prompt) * 100)
}
const turnsLabel = (n: number) => (n === 1 ? '1 turno' : `${n} turni`)

// Barra del cache hit: 10 celle, colore per fascia (verde ≥ 70%, giallo ≥ 30%, rosso sotto).
const BAR_CELLS = 10
const bar = (pct: number) => {
  const full = Math.round((pct / 100) * BAR_CELLS)
  return { full: '█'.repeat(full), empty: '░'.repeat(BAR_CELLS - full) }
}
const hitColor = (pct: number) => (pct >= 70 ? 'success' : pct >= 30 ? 'warning' : 'error')
// Contesto: fasce invertite rispetto al hit (verde sotto 50%, giallo fino a 80%, rosso oltre).
const fillColor = (pct: number) => (pct < 50 ? 'success' : pct <= 80 ? 'warning' : 'error')

// Larghezze (colonne) sotto cui la riga si compatta: prima le etichette si accorciano, poi sparisce la barra.
const WIDE = 136
const WITH_BAR = 110
// La cornice costa 2 righe: senza spazio per le righe della banda più la cornice, niente cornice.
const FRAME_ROWS = 2
// Colonna delle etichette di riga: minima per larghezza, allargata fino a un tetto per etichette lunghe.
const LABEL_MIN_WIDE = 21
const LABEL_MIN_NARROW = 17
const LABEL_MAX = 28

export const register: Register = (on, options) => {
  // Opzioni (userConfig): voce di stato e conteggio dei subagenti.
  const showStatus = options.showStatus === true
  const includeSubagents = options.includeSubagents === true

  on('turn.complete', async ($, e, next) => {
    // Senza usage (interruzione, errore API) non c'è nulla da contare.
    if (e.usage) {
      const turn: Counts = {
        input: e.usage.input_tokens,
        output: e.usage.output_tokens,
        cacheRead: e.usage.cache_read_input_tokens,
        cacheWrite: e.usage.cache_creation_input_tokens,
      }
      const agentId = e.agentId
      // Ogni thread ha i suoi conteggi: quelli dei subagenti servono alla vista dell'agente
      // e, solo con includeSubagents, entrano nel totale di sessione.
      await update($, stats, (s: Stats | null): Stats => {
        const cur = s ?? { main: emptyThread, agents: {} }
        return agentId === undefined
          ? { ...cur, main: record(cur.main, turn) }
          : { ...cur, agents: { ...cur.agents, [agentId]: record(cur.agents[agentId] ?? emptyThread, turn) } }
      })
      if (showStatus && (agentId === undefined || includeSubagents)) {
        $.ui.status(`cache hit ${hitRate(turn)}% · out ${fmt(turn.output)}`)
      }
    }
    return next(e)
  })

  // Dopo ogni turno principale il motore misura la sessione: si tiene la finestra e il suo riempimento.
  // Dopo un /compact tokens manca finché non arriva una nuova risposta, e la riga sparisce.
  on('session.measure', async ($, e, next) => {
    const { tokens, window, percent } = e.context
    await update($, context, (): Context | null =>
      tokens === undefined || percent === undefined ? null : { tokens, window, percent },
    )
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, stats)
    const ctx = await read($, context)
    if (e.props.hasSurvey || s === null) return next(e)

    // Cosa mostrare: l'agente la cui trascrizione è aperta, oppure la sessione principale.
    const viewAgent = e.props.view.agentId
    let last: Counts | null
    let total: Counts
    let totalLabel: string
    if (viewAgent !== undefined) {
      const t = s.agents[viewAgent]
      if (t === undefined) return next(e)
      last = t.last
      total = t.total
      totalLabel = `Agente · ${turnsLabel(t.turns)}`
    } else {
      const subs = includeSubagents ? Object.values(s.agents) : []
      const subTurns = subs.reduce((n, t) => n + t.turns, 0)
      if (s.main.turns === 0 && subTurns === 0) return next(e)
      // "Ultimo turno" è sempre del thread principale: assente finché non ne arriva uno.
      last = s.main.last
      total = subs.reduce((c, t) => add(c, t.total), s.main.total)
      totalLabel = `Sessione · ${turnsLabel(s.main.turns)}${subTurns > 0 ? ` + ${subTurns} sub` : ''}`
    }

    const { Box, Text } = $.ui.resolve(e)
    const isWide = e.props.bodyColumns >= WIDE
    const hasBar = e.props.bodyColumns >= WITH_BAR
    const showContext = viewAgent === undefined && ctx !== null
    const bandRows = (last !== null ? 1 : 0) + 1 + (showContext ? 1 : 0)
    const isFramed = e.props.maxRows >= bandRows + FRAME_ROWS
    const labelWidth = Math.min(LABEL_MAX, Math.max(isWide ? LABEL_MIN_WIDE : LABEL_MIN_NARROW, totalLabel.length + 1))

    // Etichetta in chiaro (colore del testo, non attenuata), valore in grassetto nel colore dell'icona.
    // Su schermi stretti l'etichetta si accorcia ma resta sempre visibile.
    const stat = (k: string, icon: string, label: string, short: string, value: string, color: string) => (
      <Text key={k} wrap="truncate">
        <Text color={color}>{icon} </Text>
        <Text>{isWide ? label : short}: </Text>
        <Text bold color={color}>{value}</Text>
      </Text>
    )
    const sep = (k: string) => <Text key={k} color="subtle">│</Text>
    const labelCell = (label: string) => (
      <Box width={labelWidth} flexShrink={0}>
        <Text bold color="claude" wrap="truncate">{label}</Text>
      </Box>
    )

    const row = (key: string, label: string, c: Counts) => {
      const pct = hitRate(c)
      const { full, empty } = bar(pct)
      return (
        <Box key={key} flexDirection="row" gap={1}>
          {labelCell(label)}
          {stat('in', '↓', 'Input', 'In', fmt(c.input), 'suggestion')}
          {sep('s1')}
          {stat('out', '↑', 'Output', 'Out', fmt(c.output), 'claude')}
          {sep('s2')}
          {stat('read', '◆', 'Cache letta', 'Letta', fmt(c.cacheRead), 'success')}
          {sep('s3')}
          {stat('write', '◇', 'Cache scritta', 'Scritta', fmt(c.cacheWrite), 'warning')}
          {sep('s4')}
          <Text wrap="truncate">
            <Text color={hitColor(pct)}>● </Text>
            <Text>{isWide ? 'Cache hit' : 'Hit'}: </Text>
            {hasBar ? <Text color={hitColor(pct)}>{full}</Text> : null}
            {hasBar ? <Text color="subtle">{empty} </Text> : null}
            <Text bold color={hitColor(pct)}>{`${pct}%`}</Text>
          </Text>
        </Box>
      )
    }

    // Il contesto è del thread principale: nella vista di un agente la riga non compare.
    const contextRow = (c: Context) => {
      const { full, empty } = bar(c.percent)
      return (
        <Box key="context" flexDirection="row" gap={1}>
          {labelCell('Contesto')}
          {stat('used', '▣', 'Usato', 'Usato', `${fmt(c.tokens)} / ${fmt(c.window)}`, fillColor(c.percent))}
          {sep('s5')}
          <Text wrap="truncate">
            <Text color={fillColor(c.percent)}>● </Text>
            <Text>{isWide ? 'Riempimento' : 'Pieno'}: </Text>
            {hasBar ? <Text color={fillColor(c.percent)}>{full}</Text> : null}
            {hasBar ? <Text color="subtle">{empty} </Text> : null}
            <Text bold color={fillColor(c.percent)}>{`${c.percent}%`}</Text>
          </Text>
        </Box>
      )
    }

    return (
      <Box
        flexDirection="column"
        borderStyle={isFramed ? 'round' : undefined}
        borderColor="subtle"
        paddingX={isFramed ? 1 : 0}
      >
        {last !== null ? row('last', 'Ultimo turno', last) : null}
        {row('total', totalLabel, total)}
        {showContext && ctx !== null ? contextRow(ctx) : null}
      </Box>
    )
  })
}
