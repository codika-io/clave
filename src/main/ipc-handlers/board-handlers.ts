import { ipcMain } from 'electron'
import { boardManager } from '../board-manager'

export function registerBoardHandlers(): void {
  ipcMain.handle('board:load', () => boardManager.load())
  ipcMain.handle('board:save', (_event, data) => boardManager.save(data))
}
