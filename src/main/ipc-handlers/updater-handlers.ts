import { ipcMain } from 'electron'
import {
  installUpdate,
  startDownload,
  cancelDownload,
  openUpdaterLog,
  type DownloadAttempt
} from '../auto-updater'

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:install', () => installUpdate())
  ipcMain.handle('updater:start-download', (_event, attempt?: DownloadAttempt) =>
    startDownload(attempt === 'retry' ? 'retry' : 'first')
  )
  ipcMain.handle('updater:cancel-download', () => cancelDownload())
  ipcMain.handle('updater:open-log', () => openUpdaterLog())
}
