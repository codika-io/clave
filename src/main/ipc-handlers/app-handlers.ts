import { ipcMain, app, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import { preferencesManager, type AppIcon } from '../preferences-manager'

const VALID_ICONS = ['dark', 'light', 'claude'] as const

const logPath = join(app.getPath('userData'), 'icon-debug.log')

function debugLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    fs.appendFileSync(logPath, line)
  } catch {
    // ignore
  }
}

/**
 * Resolve the on-disk path for an icon PNG.
 * In packaged builds, resources are asar-unpacked so osascript can read them.
 * In dev, __dirname is src/main/ → ../../resources/ works directly.
 */
function getIconPath(icon: string): string {
  const base = join(__dirname, '../../resources')
  const asarUnpacked = base.replace('app.asar', 'app.asar.unpacked')
  return join(asarUnpacked, `icon-${icon}.png`)
}

/**
 * Derive the .app bundle path from the executable path.
 * e.g. /Applications/Clave.app/Contents/MacOS/Clave → /Applications/Clave.app
 */
function getAppBundlePath(): string | null {
  if (process.platform !== 'darwin' || !app.isPackaged) return null
  const exePath = app.getPath('exe')
  const appPath = exePath.replace(/\/Contents\/MacOS\/.*$/, '')
  return appPath.endsWith('.app') ? appPath : null
}

/**
 * Synchronously set the .app bundle icon via NSWorkspace JXA.
 * This persists as a macOS extended attribute (no code-sign breakage).
 * Synchronous to eliminate all race conditions from concurrent osascript calls.
 */
function setAppBundleIcon(icon: string): void {
  const appPath = getAppBundlePath()
  if (!appPath) return

  const iconPath = getIconPath(icon)
  debugLog(`setAppBundleIcon: icon=${icon} iconPath=${iconPath} appPath=${appPath}`)

  const iconExists = fs.existsSync(iconPath)
  debugLog(`  iconExists=${iconExists}`)
  if (!iconExists) return

  const script = [
    `ObjC.import('AppKit')`,
    `var img = $.NSImage.alloc.initWithContentsOfFile('${iconPath}')`,
    `$.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, '${appPath}', 0)`
  ].join('; ')

  try {
    const result = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf-8',
      timeout: 5000
    })
    debugLog(`  result=${result.trim()}`)

    // Bust macOS Dock icon cache: touch the .app to update mtime,
    // then force Launch Services to re-read app metadata.
    // Without this, the Dock shows a stale cached icon after auto-updates
    // replace the .app bundle (which wipes the custom icon extended attribute).
    const now = new Date()
    fs.utimesSync(appPath, now, now)

    const lsregister =
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
    if (fs.existsSync(lsregister)) {
      try {
        execFileSync(lsregister, ['-f', appPath], { timeout: 5000 })
        debugLog(`  lsregister: refreshed`)
      } catch (lsErr) {
        debugLog(`  lsregister ERROR: ${lsErr}`)
      }
    }
  } catch (err) {
    debugLog(`  ERROR: ${err}`)
  }
}

export function applyPersistedIcon(): void {
  const savedIcon = preferencesManager.get('appIcon')
  debugLog(`applyPersistedIcon: savedIcon=${savedIcon}`)
  setAppBundleIcon(savedIcon)
}

export function registerAppHandlers(): void {
  ipcMain.handle('app:set-icon', (_event, icon: string) => {
    if (!VALID_ICONS.includes(icon as (typeof VALID_ICONS)[number])) return

    debugLog(`IPC app:set-icon: icon=${icon}`)

    const iconPath = getIconPath(icon)
    const image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) {
      debugLog(`  nativeImage is empty for ${iconPath}`)
      return
    }

    preferencesManager.set('appIcon', icon as AppIcon)

    if (process.platform === 'darwin') {
      app.dock?.setIcon(image)
    }

    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setIcon(image)
    }

    // Persist to the .app bundle so it survives quit
    setAppBundleIcon(icon)
  })
}
