import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Counts, Stats } from '../types'

const stats = atom({ plugin: 'token-cache-band', key: 'stats' } as const, null)

const zero: Counts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const add = (a: Counts, b: Counts): Counts => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const hitRate = (c: Counts) => {
  const prompt = c.input + c.cacheRead + c.cacheWrite
  return prompt === 0 ? 0 : Math.round((c.cacheRead / prompt) * 100)
}
const turnsLabel = (n: number) => (n === 1 ? '1 turno' : `${n} turni`)
const line = (label: string, c: Counts) =>
  `${label}: in ${fmt(c.input)} · out ${fmt(c.output)} · cache letta ${fmt(c.cacheRead)} · cache scritta ${fmt(c.cacheWrite)} · hit ${hitRate(c)}%`

export const register: Register = (on, options) => {
  // Opzioni (userConfig): voce di stato e conteggio dei subagenti.
  const showStatus = options.showStatus === true
  const includeSubagents = options.includeSubagents === true

  on('turn.complete', async ($, e, next) => {
    const isMain = e.agentId === undefined

    // Senza usage (interruzione, errore API) non c'è nulla da contare;
    // i subagenti si contano solo se l'opzione è attiva.
    if (e.usage && (isMain || includeSubagents)) {
      const turn: Counts = {
        input: e.usage.input_tokens,
        output: e.usage.output_tokens,
        cacheRead: e.usage.cache_read_input_tokens,
        cacheWrite: e.usage.cache_creation_input_tokens,
      }
      await update($, stats, (s: Stats | null): Stats => ({
        // "Ultimo turno" riguarda sempre il thread principale.
        last: isMain ? turn : (s?.last ?? turn),
        total: add(s?.total ?? zero, turn),
        turns: (s?.turns ?? 0) + 1,
      }))
      if (showStatus) {
        $.ui.status(`cache hit ${hitRate(turn)}% · out ${fmt(turn.output)}`)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, stats)
    if (e.props.hasSurvey || s === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text dimColor>{line('Ultimo turno', s.last)}</Text>
        <Text dimColor>{line(`Sessione (${turnsLabel(s.turns)})`, s.total)}</Text>
      </Box>
    )
  })
}
