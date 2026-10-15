export type Counts = { input: number; output: number; cacheRead: number; cacheWrite: number }
// Un thread: il principale o un subagente. last è null finché il thread non ha un turno con usage.
export type Thread = { last: Counts | null; total: Counts; turns: number }
export type Stats = { main: Thread; agents: Record<string, Thread> }
// Contesto del thread principale: token dell'ultima risposta, finestra del modello, percentuale 0-100.
export type Context = { tokens: number; window: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'token-cache-band': { threads: Stats | null; context: Context | null }
  }
}
