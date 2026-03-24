import { ipcMain, BrowserWindow } from 'electron'
import { ptyManager, type PtySpawnOptions } from '../pty-manager'
import * as titleGenerator from '../title-generator'

const IDLE_DELAY_MS = 2000
const MIN_BUFFER_CHARS = 200

export function registerPtyHandlers(): void {
  ipcMain.handle('pty:spawn', (_event, cwd: string, options?: PtySpawnOptions) => {
    const session = ptyManager.spawn(cwd, options)
    const win = BrowserWindow.fromWebContents(_event.sender)
    const isClaudeMode = options?.claudeMode !== false

    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let idleCount = 0 // Track idle transitions: 1st = startup banner, 2nd = after first exchange

    session.ptyProcess.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:data:${session.id}`, data)
      }

      // Accumulate output for auto-title generation (Claude mode only)
      if (isClaudeMode && !titleGenerator.isAlreadyTitled(session.id)) {
        titleGenerator.accumulate(session.id, data)

        // Debounce idle detection for title generation
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          if (titleGenerator.isAlreadyTitled(session.id)) return

          if (titleGenerator.hasUserMessage(session.id)) {
            // Primary path: generate from the user's first message (clean signal)
            titleGenerator.generateTitle(session.id).then((title) => {
              if (win && !win.isDestroyed()) {
                win.webContents.send(`session:auto-title:${session.id}`, title)
              }
            }).catch(() => {
              // Silent failure — session keeps its folder name
            })
          } else {
            idleCount++
            // First idle without user message = startup banner done — clear buffer
            if (idleCount === 1) {
              titleGenerator.resetBuffer(session.id)
            } else if (titleGenerator.getBufferLength(session.id) >= MIN_BUFFER_CHARS) {
              // Fallback: generate from raw buffer if prompt marker extraction failed
              titleGenerator.generateTitle(session.id).then((title) => {
                if (win && !win.isDestroyed()) {
                  win.webContents.send(`session:auto-title:${session.id}`, title)
                }
              }).catch(() => {
                // Silent failure — session keeps its folder name
              })
            }
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
