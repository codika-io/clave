import { ipcMain, BrowserWindow, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { fileManager } from '../file-manager'
import { IGNORED_DIRECTORIES_SET, FS_WATCH_DEBOUNCE_MS } from '../constants'

/** Active file system watchers keyed by webContents id */
const fsWatchers = new Map<
  number,
  { cwd: string; watcher: fs.FSWatcher; cleanup: () => void }
>()

export function registerFsHandlers(): void {
  ipcMain.handle('fs:list-files', (_event, cwd: string) => fileManager.listFiles(cwd))
  ipcMain.handle('fs:read-dir', (_event, rootCwd: string, dirPath: string) =>
    fileManager.readDir(rootCwd, dirPath)
  )
  ipcMain.handle('fs:read-file', (_event, rootCwd: string, filePath: string) =>
    fileManager.readFile(rootCwd, filePath)
  )
  ipcMain.handle('fs:stat', (_event, rootCwd: string, filePath: string) =>
    fileManager.stat(rootCwd, filePath)
  )
  ipcMain.handle('fs:write-file', (_event, rootCwd: string, filePath: string, content: string) =>
    fileManager.writeFile(rootCwd, filePath, content)
  )
  ipcMain.handle('fs:create-file', (_event, rootCwd: string, filePath: string) =>
    fileManager.createFile(rootCwd, filePath)
  )
  ipcMain.handle('fs:create-directory', (_event, rootCwd: string, dirPath: string) =>
    fileManager.createDirectory(rootCwd, dirPath)
  )
  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    shell.showItemInFolder(fullPath)
  })

  // File system watcher — recursive fs.watch with debounced change events
  ipcMain.handle('fs:watch', (_event, cwd: string) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (!win) return

    const wcId = _event.sender.id

    // Close any existing watcher for this window
    const existing = fsWatchers.get(wcId)
    if (existing) existing.cleanup()

    try {
      const changedDirs = new Set<string>()
      let debounceTimer: NodeJS.Timeout | null = null

      const watcher = fs.watch(cwd, { recursive: true }, (_eventType, filename) => {
        if (!filename) return

        // Skip ignored directories
        const segments = filename.split(path.sep)
        if (segments.some((s) => IGNORED_DIRECTORIES_SET.has(s))) return

        const dir = path.dirname(filename)
        changedDirs.add(dir === '.' ? '.' : dir)

        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('fs:changed', cwd, Array.from(changedDirs))
          }
          changedDirs.clear()
        }, FS_WATCH_DEBOUNCE_MS)
      })

      const cleanup = (): void => {
        if (debounceTimer) clearTimeout(debounceTimer)
        watcher.close()
        fsWatchers.delete(wcId)
      }

      watcher.on('error', cleanup)
      fsWatchers.set(wcId, { cwd, watcher, cleanup })
    } catch {
      // fs.watch can throw if path doesn't exist
    }
  })

  ipcMain.handle('fs:unwatch', (_event) => {
    const wcId = _event.sender.id
    const existing = fsWatchers.get(wcId)
    if (existing) existing.cleanup()
  })
}
