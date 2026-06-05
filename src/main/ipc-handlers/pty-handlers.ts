import { ipcMain, BrowserWindow } from 'electron'
import { ptyManager, isTmuxAvailable, type PtySpawnOptions } from '../pty-manager'
import { getPreference } from './clave-file-handlers'
import * as titleGenerator from '../title-generator'
import { startWatching as startAgentStateWatching, clearState as clearAgentState } from '../agent-state-manager'

export function registerPtyHandlers(): void {
  // Buffer PTY input per session to detect /clear command
  const inputBuffers = new Map<string, string>()

  // Deterministic Claude session state (from CC lifecycle hooks) → renderer.
  startAgentStateWatching((claveSessionId, state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(`agent:state:${claveSessionId}`, state)
    }
  })

  ipcMain.handle('pty:spawn', (_event, cwd: string, options?: PtySpawnOptions) => {
    // tmux mode is a global app setting, ON by default. Honour it unless a
    // caller overrides per-spawn or the user explicitly turned it off. (When
    // tmux isn't installed the spawn transparently falls back to a plain shell.)
    const tmuxMode = options?.tmuxMode ?? getPreference('tmuxMode') !== false
    const session = ptyManager.spawn(cwd, { ...options, tmuxMode })
    const win = BrowserWindow.fromWebContents(_event.sender)
    const isClaudeMode = options?.claudeMode !== false && !options?.geminiMode && !options?.codexMode && !options?.claudeAgentsMode
    const isResumed = !!options?.resumeSessionId

    // Schedule title generation for new Claude-mode sessions
    if (isClaudeMode && !isResumed && session.claudeSessionId && win) {
      titleGenerator.scheduleTitleGeneration(session.id, session.cwd, session.claudeSessionId, win)
    }

    // Attach listeners now so the channels are ready before the renderer
    // triggers the actual pty.spawn() via pty:start (or first pty:resize).
    ptyManager.attachListeners(
      session.id,
      (data) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(`pty:data:${session.id}`, data)
        }
      },
      (exitCode) => {
        titleGenerator.cleanup(session.id)
        inputBuffers.delete(session.id)
        clearAgentState(session.id)
        if (win && !win.isDestroyed()) {
          win.webContents.send(`pty:exit:${session.id}`, exitCode)
        }
      }
    )

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

  // Renderer calls this once xterm has been fit, so claude/gemini are spawned
  // at the real cols/rows instead of the default 80×24.
  ipcMain.on('pty:start', (_event, id: string, cols: number, rows: number) => {
    ptyManager.start(id, cols, rows)
  })

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

  // Lets the settings UI enable/disable the "persistent sessions" toggle.
  ipcMain.handle('tmux:available', () => {
    return isTmuxAvailable()
  })

  // On launch the renderer asks which tmux-backed sessions survived a previous
  // run so it can recreate their tabs and reattach. This call also prunes stale
  // sidecars and reaps orphaned clave sessions.
  ipcMain.handle('tmux:list-adoptable', () => {
    return ptyManager.listAdoptableTmuxSessions()
  })

  // User declined to adopt a survivor → destroy it.
  ipcMain.handle('tmux:discard', (_event, tmuxName: string) => {
    ptyManager.discardTmuxSession(tmuxName)
  })
}
