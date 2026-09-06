import { create } from 'zustand'
import type { PiUsageTotals, UsageError, UsageLimits, UsageWindow } from '../../../preload/index.d'
import type { Session } from './session-types'
import { createUsageResource } from './usage-resource'

export type UsageProvider = 'claude' | 'codex' | 'pi' | 'antigravity'
export const USAGE_PROVIDER_LABELS = {
  claude: 'Claude Code',
  codex: 'Codex',
  pi: 'Pi',
  antigravity: 'Antigravity'
}

/** Local account data cannot describe a remote terminal's account. With no
 * selected tab we retain the default Claude overview; plain terminals have no quota. */
export function usageProviderForSession(
  session:
    | Pick<
        Session,
        | 'sessionType'
        | 'claudeMode'
        | 'claudeAgentsMode'
        | 'codexMode'
        | 'piMode'
        | 'antigravityMode'
      >
    | undefined
): UsageProvider | null {
  if (!session) return null
  if (session.sessionType !== 'local') return null
  if (session.piMode) return 'pi'
  if (session.codexMode) return 'codex'
  if (session.antigravityMode) return 'antigravity'
  return session.claudeMode || session.claudeAgentsMode ? 'claude' : null
}

async function limits(result: Promise<UsageLimits | UsageError>): Promise<UsageLimits> {
  const value = await result
  if ('error' in value) throw new Error(value.error)
  return value
}

// One cache per provider and Pi range, shared by the pane and sidebar. Switching
// tabs cannot let an outstanding request overwrite another provider's data.
export const useUsageStore = createUsageResource(() => limits(window.electronAPI.getUsageLimits()))
export const useCodexUsageStore = createUsageResource(() =>
  limits(window.electronAPI.getCodexUsageLimits())
)
export const piUsageStores = {
  today: createUsageResource(() => window.electronAPI.getPiUsage('today')),
  '7d': createUsageResource(() => window.electronAPI.getPiUsage('7d')),
  '30d': createUsageResource(() => window.electronAPI.getPiUsage('30d')),
  all: createUsageResource(() => window.electronAPI.getPiUsage('all'))
}
export const quotaUsageStores = { claude: useUsageStore, codex: useCodexUsageStore }

// The footer and pane share the selected provider, including when settings is open.
export const useUsageNavigation = create<{
  provider: UsageProvider | null
  select: (provider: UsageProvider) => void
}>((set) => ({
  provider: null,
  select: (provider) => set({ provider })
}))

export function formatPiTokens(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  )
}
export function piTodaySummary(totals: PiUsageTotals): string {
  return `${formatPiTokens(totals.totalTokens)} tokens · $${totals.cost.toFixed(2)} today`
}

/**
 * The window that is actually going to stop you: the one with the least left,
 * the service's own severity taken first where it disagrees with the raw
 * percentage (it is plan-aware and we are not).
 *
 * This is the auto-detection. Which caps an account has is not ours to know —
 * a session block, a weekly all-models cap, one weekly cap per model, and
 * whatever the service adds next — so nothing here names a window. It reads
 * whatever came back and picks the tightest.
 */
export function tightestWindow(windows: UsageWindow[]): UsageWindow | null {
  const rank = { normal: 0, warning: 1, critical: 2 }
  let best: UsageWindow | null = null
  for (const w of windows) {
    if (!best) {
      best = w
      continue
    }
    const a = rank[w.severity ?? 'normal']
    const b = rank[best.severity ?? 'normal']
    if (a > b || (a === b && w.usedPercentage > best.usedPercentage)) best = w
  }
  return best
}

/** The short name for a cap — what a one-line readout has room for. */
export function shortLabel(w: UsageWindow): string {
  if (w.scope) return w.scope
  if (w.kind === 'session') return 'session'
  if (w.kind === 'weekly_all') return 'weekly'
  return w.label
}

/** "resets in 3h12m" / "resets in 2d". Null when the service did not say. */
export function formatReset(resetsAt: number | null): string | null {
  if (resetsAt == null) return null
  const secs = Math.max(0, Math.round((resetsAt - Date.now()) / 1000))
  const d = Math.floor(secs / 86400)
  if (d >= 1) return `resets in ${d}d`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `resets in ${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `resets in ${m}m`
  return 'resets shortly'
}

// Poll only providers/ranges that have been viewed. Codex is never started just
// because a Claude-only user opened Clave. Focus/wake refreshes stale data too.
if (typeof window !== 'undefined') {
  const refresh = (): void => {
    for (const store of [useUsageStore, useCodexUsageStore, ...Object.values(piUsageStores)]) {
      if (store.getState().status !== 'idle') void store.getState().load()
    }
  }
  setInterval(refresh, 5 * 60_000)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh()
  })
}
