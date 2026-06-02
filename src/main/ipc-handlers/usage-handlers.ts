import { ipcMain } from 'electron'
import { usageManager } from '../usage-manager'

export function registerUsageHandlers(): void {
  ipcMain.handle('usage:get-limits', () => usageManager.getLimits())
}
