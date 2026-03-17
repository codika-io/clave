import { ipcMain, app, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { execFile } from 'child_process'
import { preferencesManager, type AppIcon } from '../preferences-manager'

const VALID_ICONS = ['dark', 'light', 'claude'] as const

/**
 * Resolve the on-disk path for an icon PNG.
 * In packaged builds, resources are asar-unpacked so osascript can read them.
 * In dev, __dirname is src/main/ → ../../resources/ works directly.
 */
function getIconPath(icon: string): string {
  const base = join(__dirname, '../../resources')
  // In packaged builds, the asar-unpacked mirror has the same relative layout
  const asarUnpacked = base.replace('app.asar', 'app.asar.unpacked')
  return join(asarUnpacked, `icon-${icon}.png`)
}

/**
 * Use NSWorkspace.setIcon:forFile: via JXA to persist the dock icon
 * on the .app bundle. This survives quit/relaunch because macOS stores
 * it as an extended attribute, not inside the bundle (no code-sign breakage).
 */
function setAppBundleIcon(iconPath: string): void {
  if (process.platform !== 'darwin' || !app.isPackaged) return

  // Derive the .app bundle path from the executable path
  // e.g. /Applications/Clave.app/Contents/MacOS/Clave → /Applications/Clave.app
  const exePath = app.getPath('exe')
  const appPath = exePath.replace(/\/Contents\/MacOS\/.*$/, '')
  if (!appPath.endsWith('.app')) return

  const script = [
    `ObjC.import('AppKit')`,
    `var img = $.NSImage.alloc.initWithContentsOfFile('${iconPath}')`,
    `$.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, '${appPath}', 0)`
  ].join('; ')

  execFile('osascript', ['-l', 'JavaScript', '-e', script], (err) => {
    if (err) console.error('[app-icon] Failed to set bundle icon:', err.message)
  })
}

export function applyPersistedIcon(): void {
  const savedIcon = preferencesManager.get('appIcon')
  const iconPath = getIconPath(savedIcon)
  setAppBundleIcon(iconPath)
}

export function registerAppHandlers(): void {
  ipcMain.handle('app:set-icon', (_event, icon: string) => {
    if (!VALID_ICONS.includes(icon as (typeof VALID_ICONS)[number])) return

    const iconPath = getIconPath(icon)
    const image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) return

    preferencesManager.set('appIcon', icon as AppIcon)

    if (process.platform === 'darwin') {
      app.dock?.setIcon(image)
    }

    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setIcon(image)
    }

    // Persist to the .app bundle so it survives quit
    setAppBundleIcon(iconPath)
  })
}
