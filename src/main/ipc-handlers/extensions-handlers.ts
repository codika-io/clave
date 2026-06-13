import { ipcMain } from 'electron'
import { readClaudeInventory } from '../extensions-reader'

/** Read-only inventory of installed Claude Code extensions for a config dir. */
export function registerExtensionsHandlers(): void {
  ipcMain.handle('extensions:get-inventory', (_event, configDir?: string) =>
    readClaudeInventory(configDir)
  )
}
