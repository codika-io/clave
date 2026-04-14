// src/main/ipc-handlers/inventory-handlers.ts
import { ipcMain } from 'electron'
import { inventoryManager } from '../inventory/inventory-manager'

export function registerInventoryHandlers(): void {
  ipcMain.handle('inventory:get', (_event, cwd: unknown, model: unknown) => {
    if (typeof cwd !== 'string' || cwd.length === 0) {
      return {
        cwd: '',
        contextWindow: 200000,
        totalTokens: 0,
        entries: [],
        generatedAt: Date.now(),
        warnings: ['invalid cwd']
      }
    }
    const safeModel = typeof model === 'string' ? model : undefined
    return inventoryManager.getReport(cwd, safeModel)
  })

  ipcMain.handle('inventory:invalidate', () => {
    inventoryManager.invalidate()
  })
}
