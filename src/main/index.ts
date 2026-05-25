import { app, BrowserWindow, shell, nativeImage, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { applyPersistedIcon } from './ipc-handlers/app-handlers'
import { ptyManager, preloadLoginShellEnv } from './pty-manager'
import { initAutoUpdater, cleanupAutoUpdater } from './auto-updater'
import { initNotificationManager } from './notification-manager'
import { sshManager } from './ssh-manager'
import { locationManager } from './location-manager'
import { openclawClient } from './openclaw-client'
import { preferencesManager } from './preferences-manager'
import { cleanupClaveWatchers } from './ipc-handlers/clave-file-handlers'

function createWindow(): void {
  const savedIcon = preferencesManager.get('appIcon')
  const icon = nativeImage.createFromPath(join(__dirname, `../../resources/icon-${savedIcon}.png`))

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 16 }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // In dev mode, set dock icon from PNG. In packaged mode, let macOS
  // render from the .icon bundle (which supports Tahoe glass effect).
  // applyPersistedIcon() handles copying the right .icon bundle on startup.
  if (process.platform === 'darwin' && !app.isPackaged) {
    app.dock?.setIcon(icon)
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    ptyManager.killAll()
    sshManager.disconnectAll()
    openclawClient.disconnectAll()
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
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

  mainWindow.webContents.setWindowOpenHandler((details) => {
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
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.clave.app')

  // Pre-cache login shell env asynchronously so PTY spawns don't block the main thread
  preloadLoginShellEnv()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  initNotificationManager()
  applyPersistedIcon()
  createWindow()
  initAutoUpdater()

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
            openclawClient.connect(loc.id, `ws://${loc.host}:${loc.openclawPort}`, loc.openclawToken).catch(() => {})
          }
        }).catch(() => {
          locationManager.setLocationStatus(loc.id, 'error')
        })
      }
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  cleanupClaveWatchers()
  cleanupAutoUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

