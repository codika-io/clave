// src/renderer/src/store/inventory-store.ts
import { create } from 'zustand'
import type { InventoryReport } from '../../../shared/inventory-types'

interface InventoryState {
  reports: Record<string, InventoryReport>
  loading: Record<string, boolean>
  fetch: (cwd: string, model?: string, force?: boolean) => Promise<InventoryReport | null>
  clear: (cwd?: string) => void
}

export function inventoryKey(cwd: string, model?: string): string {
  return `${cwd}::${model ?? ''}`
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  reports: {},
  loading: {},
  fetch: async (cwd, model, force) => {
    const key = inventoryKey(cwd, model)
    if (!force && get().reports[key]) return get().reports[key]
    set((s) => ({ loading: { ...s.loading, [key]: true } }))
    try {
      if (force) await window.electronAPI.invalidateInventory()
      const report = await window.electronAPI.getInventory(cwd, model)
      set((s) => ({
        reports: { ...s.reports, [key]: report },
        loading: { ...s.loading, [key]: false }
      }))
      return report
    } catch (err) {
      console.error('[inventory-store] fetch failed:', err)
      set((s) => ({ loading: { ...s.loading, [key]: false } }))
      return null
    }
  },
  clear: (cwd) => {
    if (!cwd) {
      set({ reports: {}, loading: {} })
      return
    }
    const prefix = cwd + '::'
    set((s) => {
      const reports = { ...s.reports }
      const loading = { ...s.loading }
      for (const key of Object.keys(reports)) if (key.startsWith(prefix)) delete reports[key]
      for (const key of Object.keys(loading)) if (key.startsWith(prefix)) delete loading[key]
      return { reports, loading }
    })
  }
}))

export function contextPercent(report: InventoryReport | undefined): number | null {
  if (!report) return null
  return Math.min(100, Math.round((report.totalTokens / report.contextWindow) * 100))
}
