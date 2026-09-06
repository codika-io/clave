import { ipcMain } from 'electron'
import { usageManager } from '../usage-manager'
import { codexUsageManager } from '../codex-usage'
import { piUsageManager, type PiUsageRange } from '../pi-usage'

export function registerUsageHandlers(): void {
  ipcMain.handle('usage:get-limits', () => usageManager.getLimits())
  ipcMain.handle('usage:get-codex-limits', () => codexUsageManager.getLimits())
  ipcMain.handle('usage:get-pi', (_event, range: PiUsageRange) =>
    piUsageManager.get(['today', '7d', '30d', 'all'].includes(range) ? range : 'today')
  )
}
