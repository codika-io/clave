import { ipcMain, BrowserWindow } from 'electron'
import { ptyManager, type PtySpawnOptions } from '../pty-manager'
import * as titleGenerator from '../title-generator'

const IDLE_DELAY_MS = 2000

export function registerPtyHandlers(): void {
  ipcMain.handle('pty:spawn', (_event, cwd: string, options?: PtySpawnOptions) => {
    const session = ptyManager.spawn(cwd, options)
    const win = BrowserWindow.fromWebContents(_event.sender)
    const isClaudeMode = options?.claudeMode !== false
    const isResumed = !!options?.resumeSessionId

    // Initialize title tracking for new Claude-mode sessions only
    if (isClaudeMode && !isResumed) {
      if (options?.initialCommand) {
        titleGenerator.init(session.id, options.initialCommand, options.autoExecute === true)
      } else {
        titleGenerator.init(session.id)
      }
    }

    let idleTimer: ReturnType<typeof setTimeout> | null = null

    session.ptyProcess.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:data:${session.id}`, data)
      }

      // Idle detection for auto-title generation
      if (isClaudeMode && !titleGenerator.isAlreadyTitled(session.id)) {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          if (titleGenerator.isAlreadyTitled(session.id)) return
          if (titleGenerator.onIdle(session.id)) {
            titleGenerator.generateTitle(session.id).then((title) => {
              if (win && !win.isDestroyed()) {
                win.webContents.send(`session:auto-title:${session.id}`, title)
              }
            }).catch(() => {
              // Silent failure — session keeps its folder name
            })
          }
        }, IDLE_DELAY_MS)
      }
    })

    session.ptyProcess.onExit(({ exitCode }) => {
      if (idleTimer) clearTimeout(idleTimer)
      titleGenerator.cleanup(session.id)
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:exit:${session.id}`, exitCode)
      }
    })

    if (session.claudeSessionId) {
      console.log(
        `[claude-session] PTY ${session.id} → claude session ${session.claudeSessionId}${options?.resumeSessionId ? ' (resumed)' : ' (new)'}`
      )
    }

    return {
      id: session.id,
      cwd: session.cwd,
      folderName: session.folderName,
      alive: session.alive,
      claudeSessionId: session.claudeSessionId ?? null
    }
  })

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    titleGenerator.registerInput(id, data)
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
}
