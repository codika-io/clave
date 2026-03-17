import { ipcMain, app, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { preferencesManager, type AppIcon } from '../preferences-manager'

const VALID_ICONS = ['dark', 'light', 'claude'] as const

export function registerAppHandlers(): void {
  ipcMain.handle('app:set-icon', (_event, icon: string) => {
    if (!VALID_ICONS.includes(icon as (typeof VALID_ICONS)[number])) return

    const iconPath = join(__dirname, `../../resources/icon-${icon}.png`)
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
  })
}
