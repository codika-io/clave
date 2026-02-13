import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}`)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] App is up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[updater] Download: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: ${info.version}`)
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:update-downloaded', info.version)
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
  })

  setTimeout(() => autoUpdater.checkForUpdates(), 5000)
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
