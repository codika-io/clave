import { create, type StoreApi, type UseBoundStore } from 'zustand'

export type UsageStatus = 'idle' | 'loading' | 'ready' | 'error'
export interface UsageResource<T> {
  status: UsageStatus
  data: T | null
  error: string | null
  fetchedAt: number | null
  refreshing: boolean
  load: (opts?: { force?: boolean }) => Promise<void>
}

const FRESH_MS = 60_000
const RETRY_MS = [3_000, 8_000, 20_000, 45_000]

/** A request shared by all consumers, with independent caches and retries for
 * each provider. Failed reads never masquerade as a zero or a current quota. */
export function createUsageResource<T>(
  fetcher: () => Promise<T>
): UseBoundStore<StoreApi<UsageResource<T>>> {
  let inFlight: Promise<void> | null = null
  let failures = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const store = create<UsageResource<T>>((set, get) => ({
    status: 'idle',
    data: null,
    error: null,
    fetchedAt: null,
    refreshing: false,
    load: async ({ force = false } = {}) => {
      if (inFlight) return inFlight
      const { fetchedAt, data } = get()
      if (!force && fetchedAt !== null && Date.now() - fetchedAt < FRESH_MS) return
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      set({ status: data === null ? 'loading' : 'ready', refreshing: true, error: null })
      inFlight = (async () => {
        try {
          const result = await Promise.resolve().then(fetcher)
          failures = 0
          set({ status: 'ready', data: result, fetchedAt: Date.now(), error: null })
        } catch (error) {
          set({
            status: 'error',
            data: null,
            fetchedAt: Date.now(),
            error: error instanceof Error ? error.message : 'Failed to load usage.'
          })
          if (failures < RETRY_MS.length) {
            retryTimer = setTimeout(() => {
              retryTimer = null
              void store.getState().load({ force: true })
            }, RETRY_MS[failures])
          }
          failures++
        } finally {
          inFlight = null
          set({ refreshing: false })
        }
      })()
      return inFlight
    }
  }))
  return store
}
