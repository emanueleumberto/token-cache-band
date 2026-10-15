export type Counts = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type Stats = { last: Counts; total: Counts; turns: number }

declare module 'claude-code' {
  interface PluginState {
    'token-cache-band': { stats: Stats | null }
  }
}
