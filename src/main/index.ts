// MUST stay the first import: applies --user-data-dir before any manager
// captures app.getPath('userData') at module-import time.
import './user-data-override'
import { app, BrowserWindow, shell, nativeImage, nativeTheme } from 'electron'
import { TEST_NO_ACTIVATE } from './test-mode'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { applyPersistedIcon } from './ipc-handlers/app-handlers'
import { cleanupDroppedFiles } from './ipc-handlers/dropped-file-handlers'
import { registerWindowHandlers, broadcastIdentities } from './ipc-handlers/window-handlers'
import { ptyManager, preloadLoginShellEnv } from './pty-manager'
import { initAutoUpdater, cleanupAutoUpdater } from './auto-updater'
import { buildAppMenu } from './app-menu'
import { initTelemetry, cleanupTelemetry } from './telemetry'
import { initNotificationManager } from './notification-manager'
import { sshManager } from './ssh-manager'
import { locationManager } from './location-manager'
import { openclawClient, buildOpenclawWsUrl } from './openclaw-client'
import { preferencesManager } from './preferences-manager'
import { workspaceManager } from './workspace-manager'
import { windowRegistry } from './window-registry'
import {
  initMissionControl,
  cleanupMissionControl,
  attachMissionControlWindow
} from './mission-control-manager'
import { cleanupClaveWatchers } from './ipc-handlers/clave-file-handlers'
import { startMcpServer, stopMcpServer } from './mcp/mcp-server'
import { sweepSessionMcpConfigs } from './mcp/mcp-runtime'
import { registerPreviewScheme, installPreviewProtocol } from './preview-protocol'

// Scheme privileges must be declared before app ready.
registerPreviewScheme()

// `--test-no-activate` (see test-mode.ts): become an accessory app BEFORE ready,
// so the instance never activates even once. Off-flag this block does nothing.
if (TEST_NO_ACTIVATE && process.platform === 'darwin') {
  app.setActivationPolicy('accessory')
}

/**
 * The teardown ladder (PRDCT-1703). One window closing used to run the whole
 * app's shutdown — every session in every window received pty:exit and went
 * dead. Now:
 *
 *  - a NON-LAST window closing touches only the sessions IT hosts: each is
 *    detached (`kill(id, false)` — a tmux-backed session keeps running in the
 *    tmux server with its record intact; a plain one dies exactly as it did
 *    on close before, its record stays restorable), its binding dropped, the
 *    window forgotten, the primary re-elected if it was the primary, and the
 *    new host told which sessions to re-home (`session:rehome`, the record
 *    ids — the renderer's adoption of them is the re-homing half). Sessions
 *    hosted by OTHER windows are never touched; ssh and OpenClaw stay up.
 *  - the LAST window closing is today's behavior verbatim.
 */
let quitting = false

function onWindowClosed(windowId: number): void {
  // Only CLAVE windows count (the registry's), never a stray BrowserWindow a
  // dialog or a picker might own — or the final close would skip the app's
  // shutdown.
  const remaining = windowRegistry.listWindows().filter((w) => w.id !== windowId)
  if (remaining.length === 0) {
    ptyManager.killAll()
    sshManager.disconnectAll()
    openclawClient.disconnectAll()
    windowRegistry.unregisterWindow(windowId)
    return
  }
  const hosted = windowRegistry.getSessionsForWindow(windowId)
  for (const id of hosted) ptyManager.kill(id, false)
  windowRegistry.unregisterWindow(windowId)
  // Windows closing one after another inside a quit re-home nothing: the
  // survivor is about to close too, and the last one runs the full teardown.
  if (quitting) return
  const host = windowRegistry.getPrimaryWindow()
  if (host && hosted.length > 0) host.webContents.send('session:rehome', hosted)
  broadcastIdentities()
}

function createWindow(workspaceId: string | null): BrowserWindow {
  const savedIcon = preferencesManager.get('appIcon')
  const icon = nativeImage.createFromPath(join(__dirname, `../../resources/icon-${savedIcon}.png`))

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e0d0c' : '#ffffff',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 18 }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Registered before load so the renderer's very first `window:identity`
  // finds it. The registry, not the state file, is what the window shows.
  windowRegistry.registerWindow(win, workspaceId)

  // In dev mode, set dock icon from PNG. In packaged mode, let macOS
  // render from the .icon bundle (which supports Tahoe glass effect).
  // applyPersistedIcon() handles copying the right .icon bundle on startup.
  // Skipped under --test-no-activate: there is no Dock tile to set under the
  // accessory policy, and setIcon throws on a hidden dock.
  if (process.platform === 'darwin' && !app.isPackaged && !TEST_NO_ACTIVATE) {
    app.dock?.setIcon(icon)
  }

  win.on('ready-to-show', () => {
    // showInactive() puts the window on screen without making it — or the app —
    // key, which is the whole point of --test-no-activate.
    if (TEST_NO_ACTIVATE) win.showInactive()
    else win.show()
  })

  attachMissionControlWindow(win)

  const windowId = win.id
  win.on('closed', () => onWindowClosed(windowId))

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('clave://')) {
      event.preventDefault()
      return
    }
    // In dev, allow navigating to the dev server URL
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (is.dev && devUrl && url.startsWith(devUrl)) {
      return
    }
    // Block all other navigation — links should be handled by the renderer
    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('clave://')) {
      return { action: 'deny' }
    }
    const allowed = ['https:', 'http:']
    if (allowed.some((s) => details.url.startsWith(s))) {
      shell.openExternal(details.url).catch(() => {})
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** Show a workspace in a window of its own. A workspace already shown in a
 *  window is never duplicated (mirroring is out of scope): that window is
 *  brought forward instead. Otherwise a new window opens on it, and it
 *  becomes the last-active workspace — what the first window of the next
 *  run opens on. */
export function openWorkspaceWindow(workspaceId: string): {
  windowId: number
  focusedExisting: boolean
} {
  const shown = windowRegistry.getWindowForWorkspace(workspaceId)
  if (shown) {
    if (shown.isMinimized()) shown.restore()
    shown.show()
    shown.focus()
    return { windowId: shown.id, focusedExisting: true }
  }
  const win = createWindow(workspaceId)
  workspaceManager.setLastActive(workspaceId)
  // The primary's hosted set just shrank by this workspace.
  broadcastIdentities()
  return { windowId: win.id, focusedExisting: false }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.clave.app')

  // The Dock tile is created at ready; hide it here so the test instance shows
  // none. Paired with the accessory policy set above.
  if (TEST_NO_ACTIVATE && process.platform === 'darwin') {
    app.dock?.hide()
  }

  // Pre-cache login shell env asynchronously so PTY spawns don't block the main thread
  preloadLoginShellEnv()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  registerWindowHandlers({ openWorkspaceWindow })
  installPreviewProtocol()
  // MCP failure must not break the app — spawns just omit the --mcp-config flag.
  void startMcpServer().catch((err) => console.error('[mcp] failed to start', err))
  sweepSessionMcpConfigs()
  cleanupDroppedFiles()
  initNotificationManager()
  applyPersistedIcon()
  // The first window opens on the last-active workspace (else the first
  // registered one, else the no-workspace onboarding state).
  createWindow(workspaceManager.resolveInitialWorkspaceId())
  buildAppMenu()
  initAutoUpdater()
  initTelemetry()
  initMissionControl()

  // Auto-connect locations with autoConnect enabled
  const locations = locationManager.getLocations()
  for (const loc of locations) {
    if (loc.type === 'remote' && loc.autoConnect) {
      const config = locationManager.getCredentials(loc.id)
      if (config) {
        sshManager.connect(loc.id, config).then(() => {
          locationManager.setLocationStatus(loc.id, 'connected')
          // Connect OpenClaw if detected
          if (loc.openclawPort && loc.host) {
            const token = locationManager.getOpenclawToken(loc.id)
            openclawClient.connect(loc.id, buildOpenclawWsUrl(loc), token).catch(() => {})
          }
        }).catch(() => {
          locationManager.setLocationStatus(loc.id, 'error')
        })
      }
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(workspaceManager.resolveInitialWorkspaceId())
    }
  })
})

app.on('before-quit', () => {
  quitting = true
  cleanupClaveWatchers()
  cleanupAutoUpdater()
  cleanupTelemetry()
  cleanupMissionControl()
  stopMcpServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
