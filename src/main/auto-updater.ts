import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

const CHECK_INTERVAL = 30 * 60 * 1000 // 30 minutes
const INITIAL_DELAY = 5000
const RETRY_DELAY = 60 * 1000 // 1 minute

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

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] Check failed:', err?.message)
      // Retry once after a delay
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((retryErr) => {
          console.error('[updater] Retry failed:', retryErr?.message)
        })
      }, RETRY_DELAY)
    })
  }

  setTimeout(check, INITIAL_DELAY)
  setInterval(check, CHECK_INTERVAL)
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
