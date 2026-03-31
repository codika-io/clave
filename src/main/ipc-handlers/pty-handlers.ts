import { ipcMain, BrowserWindow } from 'electron'
import { ptyManager, type PtySpawnOptions } from '../pty-manager'
import * as titleGenerator from '../title-generator'

export function registerPtyHandlers(): void {
  ipcMain.handle('pty:spawn', (_event, cwd: string, options?: PtySpawnOptions) => {
    const session = ptyManager.spawn(cwd, options)
    const win = BrowserWindow.fromWebContents(_event.sender)
    const isClaudeMode = options?.claudeMode !== false
    const isResumed = !!options?.resumeSessionId

    // Schedule title generation for new Claude-mode sessions
    if (isClaudeMode && !isResumed && session.claudeSessionId && win) {
      titleGenerator.scheduleTitleGeneration(session.id, session.cwd, session.claudeSessionId, win)
    }

    session.ptyProcess.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:data:${session.id}`, data)
      }
    })

    session.ptyProcess.onExit(({ exitCode }) => {
      titleGenerator.cleanup(session.id)
      inputBuffers.delete(session.id)
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

  // Buffer PTY input per session to detect /clear command
  const inputBuffers = new Map<string, string>()

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    // Track input to detect /clear command
    let buf = inputBuffers.get(id) ?? ''
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        // Enter pressed — check if the buffered line is /clear
        if (/^\/clear\s*$/.test(buf.trim())) {
          titleGenerator.notifyClear(id)
        }
        buf = ''
      } else if (ch === '\x7f' || ch === '\b') {
        buf = buf.slice(0, -1)
      } else if (ch === '\x03' || ch === '\x15') {
        // Ctrl+C or Ctrl+U — clear buffer
        buf = ''
      } else if (ch >= ' ') {
        buf += ch
      }
    }
    inputBuffers.set(id, buf)

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
