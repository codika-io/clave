import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ptyManager } from './pty-manager'
import { installUpdate } from './auto-updater'
import { fileManager } from './file-manager'
import { boardManager } from './board-manager'
import { usageManager } from './usage-manager'
import { gitManager } from './git-manager'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'

function getClaudeProjectDir(cwd: string): string {
  const encoded = cwd.replace(/[/.]/g, '-')
  return path.join(homedir(), '.claude', 'projects', encoded)
}

function snapshotJsonlFiles(dir: string): Set<string> {
  try {
    const entries = fs.readdirSync(dir)
    return new Set(entries.filter((e) => e.endsWith('.jsonl')))
  } catch {
    return new Set()
  }
}

function detectClaudeSessionId(
  dir: string,
  existingFiles: Set<string>
): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false
    let watcher: fs.FSWatcher | null = null

    const done = (id: string | null): void => {
      if (resolved) return
      resolved = true
      watcher?.close()
      resolve(id)
    }

    // Check immediately for any new files (might already exist)
    try {
      const current = fs.readdirSync(dir).filter((e) => e.endsWith('.jsonl'))
      for (const file of current) {
        if (!existingFiles.has(file)) {
          done(file.replace('.jsonl', ''))
          return
        }
      }
    } catch {
      // dir may not exist yet
    }

    // Ensure directory exists for watching
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {
      // already exists
    }

    try {
      watcher = fs.watch(dir, (_eventType, filename) => {
        if (resolved) return
        if (filename && filename.endsWith('.jsonl') && !existingFiles.has(filename)) {
          done(filename.replace('.jsonl', ''))
        }
      })
      watcher.on('error', () => done(null))
    } catch {
      done(null)
      return
    }

    // 15-second timeout
    setTimeout(() => done(null), 15000)
  })
}

export function registerIpcHandlers(): void {
  // Board handlers
  ipcMain.handle('board:load', () => boardManager.load())
  ipcMain.handle('board:save', (_event, data) => boardManager.save(data))

  // Usage handlers
  ipcMain.handle('usage:get-stats', () => usageManager.getStats())
  ipcMain.handle('usage:fetch-rate-limits', () => usageManager.fetchRateLimits())

  // Git handlers
  ipcMain.handle('git:status', (_event, cwd: string) => gitManager.getStatus(cwd))
  ipcMain.handle('git:stage', (_event, cwd: string, files: string[]) => gitManager.stage(cwd, files))
  ipcMain.handle('git:unstage', (_event, cwd: string, files: string[]) =>
    gitManager.unstage(cwd, files)
  )
  ipcMain.handle('git:commit', (_event, cwd: string, message: string) =>
    gitManager.commit(cwd, message)
  )
  ipcMain.handle('git:push', (_event, cwd: string) => gitManager.push(cwd))
  ipcMain.handle('git:pull', (_event, cwd: string) => gitManager.pull(cwd))

  ipcMain.handle('updater:install', () => {
    installUpdate()
  })

  // File system handlers
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
  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    shell.showItemInFolder(fullPath)
  })

  ipcMain.handle('pty:spawn', (_event, cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean; resumeSessionId?: string }) => {
    const useClaudeMode = options?.claudeMode !== false
    const projectDir = useClaudeMode ? getClaudeProjectDir(cwd) : null
    const existingFiles = projectDir ? snapshotJsonlFiles(projectDir) : new Set<string>()

    const session = ptyManager.spawn(cwd, options)
    const win = BrowserWindow.fromWebContents(_event.sender)

    session.ptyProcess.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:data:${session.id}`, data)
      }
    })

    session.ptyProcess.onExit(({ exitCode }) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:exit:${session.id}`, exitCode)
      }
    })

    // Async: detect Claude Code session ID from new .jsonl file
    if (projectDir) {
      detectClaudeSessionId(projectDir, existingFiles).then((claudeSessionId) => {
        if (claudeSessionId && win && !win.isDestroyed()) {
          win.webContents.send(`pty:claude-session-id:${session.id}`, claudeSessionId)
        }
      })
    }

    return {
      id: session.id,
      cwd: session.cwd,
      folderName: session.folderName,
      alive: session.alive
    }
  })

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    ptyManager.write(id, data)
  })

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    ptyManager.resize(id, cols, rows)
  })

  ipcMain.handle('pty:kill', (_event, id: string) => {
    ptyManager.kill(id)
  })

  ipcMain.handle('pty:list', () => {
    return ptyManager.getAllSessions()
  })

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('dialog:openFolder', async (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
