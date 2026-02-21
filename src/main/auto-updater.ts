import { app, BrowserWindow } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'

const CHECK_INTERVAL = 30 * 60 * 1000 // 30 minutes
const INITIAL_DELAY = 5000
const RETRY_DELAY = 60 * 1000 // 1 minute

let cancellationToken: CancellationToken | null = null
let downloadCancelled = false
let isDownloading = false

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}`)
    sendToRenderer('updater:update-available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] App is up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[updater] Download: ${Math.round(progress.percent)}%`)
    sendToRenderer('updater:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: ${info.version}`)
    isDownloading = false
    sendToRenderer('updater:update-downloaded', info.version)
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
    // Only forward errors to renderer if a download was in progress.
    // checkForUpdates() errors should not trigger the download-error overlay.
    if (isDownloading && !downloadCancelled) {
      sendToRenderer('updater:download-error', err.message)
    }
    downloadCancelled = false
    isDownloading = false
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] Check failed:', err?.message)
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

export function startDownload(): void {
  downloadCancelled = false
  isDownloading = true
  cancellationToken = new CancellationToken()
  autoUpdater.downloadUpdate(cancellationToken).catch((err) => {
    if (!downloadCancelled) {
      console.error('[updater] Download failed:', err?.message)
    }
    isDownloading = false
  })
}

export function cancelDownload(): void {
  if (cancellationToken) {
    downloadCancelled = true
    isDownloading = false
    cancellationToken.cancel()
    cancellationToken = null
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
