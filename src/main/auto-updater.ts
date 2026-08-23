import { app, shell } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import log from 'electron-log/main'
import { getMainWindow } from './window-utils'
import type { DownloadProgress, UpdatePhase, UpdaterState } from '../shared/updater-types'

export type { DownloadProgress, UpdatePhase, UpdaterState }

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
 * download talks to one URL and reads nothing off disk.
 *
 * Disabling differential is enough on its own — MacUpdater checks the flag in
 * `canDifferentialDownload()` before it looks at the cached zip, so the retry
 * never touches the cache. We deliberately do NOT delete the cache: it would
 * only cost the *next* update its differential download, and removing a
 * directory in a shipped app is not a trade worth making for no gain.
 *
 * Worth knowing what this does NOT cover: `canDifferentialDownload()` also
 * returns false when the cache holds no `update.zip` at all, which is the case
 * on any machine whose last update did not complete. There the first attempt
 * was already a full download and the retry is byte-for-byte the same request.
 * That is why a failed download now also auto-retries once (see
 * `handleDownloadError`) and why the error state offers a direct download.
 */
export function downloadStrategy(attempt: DownloadAttempt): DownloadStrategy {
  return { disableDifferentialDownload: attempt === 'retry' }
}

/**
 * The phase transitions, pulled out of the event handlers so they can be
 * tested. Every one of them exists because a naive assignment was wrong:
 * updater events arrive on a 30-minute timer underneath whatever the user is
 * doing, so a handler that simply sets a phase will happily stomp a download
 * in flight with the result of a background check.
 */

/** A periodic check must not repaint a download as "checking". */
export function phaseOnCheckStart(current: UpdatePhase): UpdatePhase {
  return current === 'idle' || current === 'available' ? 'checking' : current
}

/**
 * A check that finds the version we are already downloading must leave the
 * download alone — otherwise the progress overlay is yanked back to a Download
 * button every 30 minutes.
 */
export function phaseOnAvailable(current: UpdatePhase, downloading: boolean): UpdatePhase {
  return downloading || current === 'downloaded' || current === 'error' ? current : 'available'
}

/** Nothing on the server: back to rest, unless something is in flight. */
export function phaseOnNotAvailable(current: UpdatePhase): UpdatePhase {
  return current === 'checking' || current === 'available' ? 'idle' : current
}

/**
 * A failed *check* is not a failed *update*. It must never reach the `error`
 * phase, because that phase raises a full-screen overlay over an app that is
 * working perfectly and merely does not know whether it is current.
 */
export function phaseOnCheckError(current: UpdatePhase): UpdatePhase {
  return current === 'checking' ? 'idle' : current
}

const initialProgress: DownloadProgress = {
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0
}

let state: UpdaterState = {
  supported: false,
  phase: 'idle',
  // Filled by initAutoUpdater. Kept off the module top level so importing this
  // file — as the tests do — does not need a live Electron app object.
  currentVersion: '',
  availableVersion: null,
  progress: initialProgress,
  errorMessage: null,
  checkErrorMessage: null,
  lastCheckedAt: null
}

let cancellationToken: CancellationToken | null = null
let downloadCancelled = false
let isDownloading = false
/** Guards the one automatic retry so a hard failure cannot loop. */
let autoRetried = false
let checkInterval: ReturnType<typeof setInterval> | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  getMainWindow()?.webContents.send(channel, ...args)
}

function setState(patch: Partial<UpdaterState>): void {
  state = { ...state, ...patch }
  sendToRenderer('updater:state', state)
}

export function getUpdaterState(): UpdaterState {
  return state
}

function handleDownloadError(message: string): void {
  // One silent retry, then give up and show the user something actionable.
  // `net::ERR_FAILED` on a 220 MB download is most often a connection that
  // dropped rather than anything reproducible, and asking a user to press
  // Retry for that is asking them to do the machine's job.
  if (!autoRetried) {
    autoRetried = true
    log.warn(`[updater] Download failed (${message}) — retrying once without differential`)
    startDownload('retry')
    return
  }
  setState({ phase: 'error', errorMessage: message })
}

export function initAutoUpdater(): void {
  // Set before the dev bail-out: the Software Update pane still names the
  // running version in development, it just says updates are unavailable.
  setState({ currentVersion: app.getVersion(), supported: app.isPackaged })
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
    // A check runs on a timer underneath whatever the user is doing. It must
    // not yank a finished download back to "checking".
    const phase = phaseOnCheckStart(state.phase)
    if (phase !== state.phase) setState({ phase, checkErrorMessage: null })
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`[updater] Update available: ${info.version}`)
    setState({
      availableVersion: info.version,
      lastCheckedAt: Date.now(),
      checkErrorMessage: null,
      // Never demote an in-flight or finished download back to "available".
      phase: phaseOnAvailable(state.phase, isDownloading)
    })
    sendToRenderer('updater:update-available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] App is up to date')
    setState({
      availableVersion: null,
      lastCheckedAt: Date.now(),
      checkErrorMessage: null,
      phase: phaseOnNotAvailable(state.phase)
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[updater] Download: ${Math.round(progress.percent)}%`)
    const next: DownloadProgress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    }
    setState({ phase: 'downloading', progress: next })
    sendToRenderer('updater:download-progress', next)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[updater] Update downloaded: ${info.version}`)
    isDownloading = false
    autoRetried = false
    setState({ phase: 'downloaded', availableVersion: info.version, errorMessage: null })
    sendToRenderer('updater:update-downloaded', info.version)
  })

  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err.message)
    const wasDownloading = isDownloading && !downloadCancelled
    downloadCancelled = false
    isDownloading = false

    if (wasDownloading) {
      handleDownloadError(err.message)
      sendToRenderer('updater:download-error', err.message)
      return
    }

    // A failed check used to vanish entirely. It still must not raise an
    // overlay, but it has to be visible somewhere the user can look — the
    // Updates pane renders it next to Check Again.
    setState({
      checkErrorMessage: err.message,
      lastCheckedAt: Date.now(),
      phase: phaseOnCheckError(state.phase)
    })
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

/**
 * A check the user asked for, by pressing a button or picking the menu item.
 * Resolves with the state once the check has settled so the caller can react,
 * and never rejects — a failed check is a state, not an exception.
 */
export async function checkForUpdatesNow(): Promise<UpdaterState> {
  if (!state.supported) {
    return state
  }
  setState({ phase: phaseOnCheckStart(state.phase), checkErrorMessage: null })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('[updater] Manual check failed:', message)
    setState({
      checkErrorMessage: message,
      lastCheckedAt: Date.now(),
      phase: phaseOnCheckError(state.phase)
    })
  }
  return state
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

  if (attempt === 'first') autoRetried = false
  downloadCancelled = false
  isDownloading = true
  setState({ phase: 'downloading', progress: initialProgress, errorMessage: null })
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
  autoRetried = false
  setState({
    phase: state.availableVersion ? 'available' : 'idle',
    progress: initialProgress,
    errorMessage: null
  })
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

/** The releases page — the manual way out when the updater cannot deliver. */
export function openReleasesPage(): Promise<void> {
  return shell.openExternal(RELEASES_URL)
}

export function installUpdate(): void {
  // Do NOT call app.relaunch() here — it races with Squirrel.Mac's ShipIt process.
  // app.relaunch() fires immediately on quit, relaunching the OLD binary before
  // ShipIt has finished replacing it. Let quitAndInstall() handle everything:
  // Squirrel.Mac's ShipIt waits for the app to quit, replaces the binary, then relaunches.
  autoUpdater.quitAndInstall()
}
