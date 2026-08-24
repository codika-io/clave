import { create } from 'zustand'
import type { UsageWindow } from '../../../preload/index.d'

/**
 * The Claude rate-limit windows, fetched once for the whole renderer.
 *
 * Two places read them — the foot of the sidebar and the Usage settings pane —
 * and each used to own its own fetch, so opening settings hit the network again
 * and the refresh button moved one of them and not the other. One store, one
 * request, both live.
 *
 * The fetch goes over the network from the main process, so it is cached and
 * paced: nothing refetches inside `FRESH_MS`, a slow poll keeps the foot honest
 * while the app is open, and coming back to the window refreshes a stale read
 * rather than waiting out the poll.
 */
const FRESH_MS = 60_000
const POLL_MS = 5 * 60_000
/* A first read can fail for reasons that clear on their own — no network yet at
   launch, a laptop still waking, a keychain prompt someone had not answered.
   Retry those on a short ramp before dropping to the slow poll, or the foot of
   the sidebar simply has no second line for five minutes and nothing on screen
   says why. Reset the moment a read succeeds. */
const RETRY_MS = [3_000, 8_000, 20_000, 45_000]

export type UsageStatus = 'idle' | 'loading' | 'ready' | 'error'

interface UsageState {
  status: UsageStatus
  windows: UsageWindow[]
  fetchedAt: number | null
  error: string | null
  /** Fetch unless a fresh read is already in hand. `force` ignores the cache. */
  load: (opts?: { force?: boolean }) => Promise<void>
}

let inFlight: Promise<void> | null = null
let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRetry(): void {
  if (retryTimer) return
  const delay = RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)]
  retryTimer = setTimeout(() => {
    retryTimer = null
    void useUsageStore.getState().load({ force: true })
  }, delay)
}

export const useUsageStore = create<UsageState>((set, get) => ({
  status: 'idle',
  windows: [],
  fetchedAt: null,
  error: null,

  load: async ({ force = false } = {}) => {
    const { fetchedAt, status } = get()
    if (!force && fetchedAt !== null && Date.now() - fetchedAt < FRESH_MS) return
    // Never two requests in the air: the pane mounting during a poll would
    // otherwise race it and the loser's result would win.
    if (inFlight) return inFlight
    if (!window.electronAPI?.getUsageLimits) {
      set({ status: 'error', error: 'Usage is only available in the desktop app.' })
      return
    }

    // Keep whatever is on screen while refreshing a read we already have —
    // flashing skeletons over a good number every five minutes is worse than
    // a number that is a few minutes old.
    if (status !== 'ready') set({ status: 'loading', error: null })

    inFlight = (async () => {
      try {
        const result = await window.electronAPI.getUsageLimits()
        if ('error' in result) {
          failures++
          set({ status: 'error', error: result.error, windows: [], fetchedAt: Date.now() })
          scheduleRetry()
          return
        }
        failures = 0
        set({
          status: 'ready',
          windows: result.windows,
          fetchedAt: result.fetchedAt,
          error: null
        })
      } catch {
        failures++
        set({ status: 'error', error: 'Failed to load usage.', fetchedAt: Date.now() })
        scheduleRetry()
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }
}))

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

// One poll for the process, started with the renderer. `load` is cached, so
// every tick below is cheap when something else has already refreshed.
//
// `visibilitychange` as well as `focus`: a window that was occluded or a machine
// that was asleep comes back with a reading that is hours old, and it does not
// necessarily get a focus event on the way — a stale number presented as current
// is worse than none.
if (typeof window !== 'undefined') {
  void useUsageStore.getState().load()
  setInterval(() => void useUsageStore.getState().load(), POLL_MS)
  window.addEventListener('focus', () => void useUsageStore.getState().load())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void useUsageStore.getState().load()
  })
}
