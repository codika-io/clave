import { ipcMain } from 'electron'
import { installUpdate, startDownload, cancelDownload } from '../auto-updater'

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:install', () => installUpdate())
  ipcMain.handle('updater:start-download', () => startDownload())
  ipcMain.handle('updater:cancel-download', () => cancelDownload())
}
