// src/main/ipc-handlers/inventory-handlers.ts
import { ipcMain } from 'electron'
import { inventoryManager } from '../inventory/inventory-manager'
import { contextWindowFor } from '../inventory/token-estimator'
import type { InventoryReport } from '../../shared/inventory-types'

function emptyReport(model: string | undefined, warning: string): InventoryReport {
  return {
    cwd: '',
    model,
    contextWindow: contextWindowFor(model),
    totalTokens: 0,
    entries: [],
    generatedAt: Date.now(),
    warnings: [warning]
  }
}

export function registerInventoryHandlers(): void {
  ipcMain.handle('inventory:get', (_event, cwd: unknown, model: unknown) => {
    const safeModel = typeof model === 'string' ? model : undefined
    if (typeof cwd !== 'string' || cwd.length === 0) {
      return emptyReport(safeModel, 'invalid cwd')
    }
    return inventoryManager.getReport(cwd, safeModel)
  })

  ipcMain.handle('inventory:invalidate', () => {
    inventoryManager.invalidate()
  })
}
