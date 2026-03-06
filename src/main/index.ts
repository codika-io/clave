import { app, BrowserWindow, shell, nativeImage, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { ptyManager, preloadLoginShellEnv } from './pty-manager'
import { initAutoUpdater } from './auto-updater'
import { initNotificationManager } from './notification-manager'

function createWindow(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Kill orphaned PTYs after the window closes (beforeunload already saved state)
  mainWindow.on('closed', () => {
    ptyManager.killAll()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).catch(() => {})
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
  createWindow()
  initAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// No before-quit handler — Electron automatically closes windows on quit,
// which triggers beforeunload (renderer saves state) → closed (kills PTYs).
// Killing PTYs in before-quit would race: PTYs die before state is saved.
