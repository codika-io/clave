import { BrowserWindow } from 'electron'

/** Returns the main BrowserWindow if it exists and is not destroyed; otherwise null. */
export function getMainWindow(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0]
  return win && !win.isDestroyed() ? win : null
}
