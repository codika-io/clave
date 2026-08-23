import { app, shell } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import log from 'electron-log/main'
import { getMainWindow } from './window-utils'

const CHECK_INTERVAL = 30 * 60 * 1000 // 30 minutes
const INITIAL_DELAY = 5000
const RETRY_DELAY = 60 * 1000 // 1 minute

/** Where a user is sent when the updater cannot help itself. */
export const RELEASES_URL = 'https://github.com/codika-io/clave/releases/latest'

/**
 * Which try this is. Not a counter — the only distinction that changes what we
 * ask electron-updater to do is "first" vs "the user pressed Retry".
 */
export type DownloadAttempt = 'first' | 'retry'

export interface DownloadStrategy {
  /** Passed straight to `autoUpdater.disableDifferentialDownload`. */
  disableDifferentialDownload: boolean
}

/**
 * The first attempt takes the fast path: a differential download reads the
 * previous version's zip out of the updater cache and fetches only the blocks
 * that changed, which is the difference between a few MB and 220.
 *
 * A retry gives that up on purpose. We do not know why the first attempt
 * failed — electron-updater surfaces the download error verbatim, and
 * `net::ERR_FAILED` says only that an HTTP request did not complete — so the
 * retry's job is to remove variables rather than repeat the attempt. A full
 * download talks to one URL and reads nothing off disk. Before this existed,
 * Retry re-issued the identical call and a deterministic failure was
 * unescapable: auto-update is the whole distribution channel, so a user who hit
 * one stayed on their version indefinitely with no way to know.
 *
 * Disabling differential is enough on its own — MacUpdater checks the flag in
 * `canDifferentialDownload()` before it looks at the cached zip, so the retry
 * never touches the cache. We deliberately do NOT delete the cache: it would
 * only cost the *next* update its differential download, and removing a
 * directory in a shipped app is not a trade worth making for no gain.
 */
export function downloadStrategy(attempt: DownloadAttempt): DownloadStrategy {
  return { disableDifferentialDownload: attempt === 'retry' }
}

let cancellationToken: CancellationToken | null = null
let downloadCancelled = false
let isDownloading = false
let checkInterval: ReturnType<typeof setInterval> | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  getMainWindow()?.webContents.send(channel, ...args)
}

export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  // electron-updater logs the entire download path through this logger — which
  // URL it fetched, whether it fell back from differential to full, why a
  // download aborted. Without it a packaged build writes to a console nobody
  // can read, which is why the 1.68.0 -> 1.69.0 `net::ERR_FAILED` could not be
  // traced: the only Clave files under ~/Library/Logs were crash reports.
  log.initialize()
  log.transports.file.level = 'info'
  autoUpdater.logger = log

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`[updater] Update available: ${info.version}`)
    sendToRenderer('updater:update-available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] App is up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[updater] Download: ${Math.round(progress.percent)}%`)
    sendToRenderer('updater:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[updater] Update downloaded: ${info.version}`)
    isDownloading = false
    sendToRenderer('updater:update-downloaded', info.version)
  })

  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err.message)
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
      log.error('[updater] Check failed:', err?.message)
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((retryErr) => {
          log.error('[updater] Retry failed:', retryErr?.message)
        })
      }, RETRY_DELAY)
    })
  }

  setTimeout(check, INITIAL_DELAY)
  checkInterval = setInterval(check, CHECK_INTERVAL)
}

export function startDownload(attempt: DownloadAttempt = 'first'): void {
  const strategy = downloadStrategy(attempt)
  // Set on every attempt, not just the retry: the flag lives on the shared
  // autoUpdater singleton, so a retry that is not reset would quietly make
  // every later update a full download.
  autoUpdater.disableDifferentialDownload = strategy.disableDifferentialDownload
  log.info(
    `[updater] Starting download (attempt=${attempt}, differential=${!strategy.disableDifferentialDownload})`
  )

  downloadCancelled = false
  isDownloading = true
  cancellationToken = new CancellationToken()
  autoUpdater.downloadUpdate(cancellationToken).catch((err) => {
    if (!downloadCancelled) {
      log.error('[updater] Download failed:', err?.message)
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

export function cleanupAutoUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

/**
 * Open the log file the updater writes to. The escape hatch's escape hatch:
 * when an update fails for a reason the UI cannot explain, this is the thing a
 * user can actually send us.
 */
export function openUpdaterLog(): Promise<string> {
  return shell.openPath(log.transports.file.getFile().path)
}

export function installUpdate(): void {
  // Do NOT call app.relaunch() here — it races with Squirrel.Mac's ShipIt process.
  // app.relaunch() fires immediately on quit, relaunching the OLD binary before
  // ShipIt has finished replacing it. Let quitAndInstall() handle everything:
  // Squirrel.Mac's ShipIt waits for the app to quit, replaces the binary, then relaunches.
  autoUpdater.quitAndInstall()
}
