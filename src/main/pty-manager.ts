import * as pty from 'node-pty'
import { execFile, execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS, INITIAL_COMMAND_DELAY_MS } from './constants'
import { prepareSessionSettings, disposeSession } from './session-status-manager'

const isWindows = process.platform === 'win32'

let loginShellEnv: Record<string, string> | null = null

function getUserShell(): string {
  if (isWindows) {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

function parseEnvOutput(output: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const entry of output.split('\0')) {
    const idx = entry.indexOf('=')
    if (idx > 0) {
      env[entry.slice(0, idx)] = entry.slice(idx + 1)
    }
  }
  return env
}

/**
 * Pre-cache the login shell environment asynchronously.
 * On Windows, we just use the current process env (no login shell concept).
 * On macOS/Linux, call the login shell so that PATH and other vars are populated.
 */
export function preloadLoginShellEnv(): void {
  if (loginShellEnv !== null) return

  if (isWindows) {
    loginShellEnv = { ...process.env } as Record<string, string>
    return
  }

  execFile(getUserShell(), ['-lic', 'env -0'], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  }, (err, stdout) => {
    if (loginShellEnv !== null) return // already set by sync fallback
    if (err) {
      loginShellEnv = { ...process.env } as Record<string, string>
      return
    }
    const env = parseEnvOutput(stdout)
    loginShellEnv = Object.keys(env).length > 0 ? env : { ...process.env } as Record<string, string>
  })
}

export function getLoginShellEnv(): Record<string, string> {
  if (loginShellEnv !== null) return loginShellEnv

  if (isWindows) {
    loginShellEnv = { ...process.env } as Record<string, string>
    return loginShellEnv
  }

  // Sync fallback if async preload hasn't finished yet
  try {
    const output = execFileSync(getUserShell(), ['-lic', 'env -0'], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    })
    const env = parseEnvOutput(output)
    loginShellEnv = Object.keys(env).length > 0 ? env : { ...process.env } as Record<string, string>
  } catch {
    loginShellEnv = { ...process.env } as Record<string, string>
  }
  return loginShellEnv
}

export interface PtySpawnOptions {
  dangerousMode?: boolean
  claudeMode?: boolean
  geminiMode?: boolean
  resumeSessionId?: string
  claudeSessionId?: string
  initialCommand?: string
  autoExecute?: boolean
}

interface PendingSpawn {
  shellArgs: string[]
  cwd: string
  initialCommand?: string
  autoExecute?: boolean
}

export interface PtySession {
  id: string
  cwd: string
  folderName: string
  ptyProcess: pty.IPty | null
  alive: boolean
  claudeSessionId?: string
  pending?: PendingSpawn
  onData?: (data: string) => void
  onExit?: (exitCode: number) => void
}

class PtyManager {
  private sessions = new Map<string, PtySession>()

  /**
   * Plan a PTY spawn but defer the actual `pty.spawn()` until the renderer
   * has fit its xterm and reported real cols/rows. This avoids the TUI
   * (claude/gemini) being born at the default 80×24 and then being mangled
   * by xterm's reflow when the renderer resizes to the real width.
   *
   * `start(id, cols, rows)` finalises the spawn at the correct size.
   */
  spawn(cwd: string, options?: PtySpawnOptions): PtySession {
    const id = randomUUID()
    const folderName = (isWindows ? cwd.split('\\') : cwd.split('/')).pop() || cwd
    const useClaudeMode = options?.claudeMode !== false && !options?.geminiMode
    const useGeminiMode = options?.geminiMode === true

    let claudeSessionId: string | undefined
    let shellArgs: string[]
    if (isWindows) {
      // Windows: cmd.exe with /c to exec the command directly (no echoed prompt).
      if (useGeminiMode) {
        shellArgs = ['/c', 'gemini']
      } else if (!useClaudeMode) {
        shellArgs = []
      } else {
        const parts = ['claude']
        if (options?.resumeSessionId) {
          parts.push('--resume', options.resumeSessionId)
          claudeSessionId = options.resumeSessionId
        } else {
          claudeSessionId = options?.claudeSessionId ?? randomUUID()
          parts.push('--session-id', claudeSessionId)
        }
        if (options?.dangerousMode) parts.push('--dangerously-skip-permissions')
        const settingsPath = prepareSessionSettings(claudeSessionId, id)
        if (settingsPath) parts.push('--settings', settingsPath)
        shellArgs = ['/c', ...parts]
      }
    } else {
      // POSIX: -l -c '<cmd>' runs the command non-interactively (no echo, no
      // prompt, no rc-file chatter like the macOS bash→zsh notice).
      if (useGeminiMode) {
        shellArgs = ['-l', '-c', 'gemini']
      } else if (!useClaudeMode) {
        shellArgs = ['-l']
      } else {
        const parts = ['claude']
        if (options?.resumeSessionId) {
          parts.push('--resume', options.resumeSessionId)
          claudeSessionId = options.resumeSessionId
        } else {
          claudeSessionId = options?.claudeSessionId ?? randomUUID()
          parts.push('--session-id', claudeSessionId)
        }
        if (options?.dangerousMode) parts.push('--dangerously-skip-permissions')
        const settingsPath = prepareSessionSettings(claudeSessionId, id)
        if (settingsPath) parts.push('--settings', settingsPath)
        shellArgs = ['-l', '-c', parts.join(' ')]
      }
    }

    const session: PtySession = {
      id,
      cwd,
      folderName,
      ptyProcess: null,
      alive: true,
      pending: {
        shellArgs,
        cwd,
        initialCommand: options?.initialCommand,
        autoExecute: options?.autoExecute
      }
    }
    if (claudeSessionId) session.claudeSessionId = claudeSessionId
    this.sessions.set(id, session)
    return session
  }

  /**
   * Register the data/exit listeners that should be wired up as soon as the
   * underlying pty.spawn() runs. Must be called BEFORE start().
   */
  attachListeners(
    id: string,
    onData: (data: string) => void,
    onExit: (exitCode: number) => void
  ): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.onData = onData
    session.onExit = onExit
  }

  /**
   * Actually spawn the PTY at the renderer-measured cols/rows. Safe to call
   * once per session id; subsequent calls just resize.
   */
  start(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (session.ptyProcess) {
      // Already started — treat as resize.
      if (session.alive) session.ptyProcess.resize(cols, rows)
      return
    }
    if (!session.pending) return
    const { shellArgs, cwd, initialCommand, autoExecute } = session.pending
    session.pending = undefined

    const shellName = getUserShell()
    const ptyName = isWindows ? undefined : 'xterm-256color'

    const ptyProcess = pty.spawn(shellName, shellArgs, {
      name: ptyName,
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      cwd,
      env: (() => {
        const env: Record<string, string> = {
          ...getLoginShellEnv(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        }
        delete env.CLAUDECODE
        return env
      })()
    })

    session.ptyProcess = ptyProcess

    if (session.onData) {
      ptyProcess.onData(session.onData)
    }
    ptyProcess.onExit(({ exitCode }) => {
      session.alive = false
      disposeSession(session.claudeSessionId)
      session.onExit?.(exitCode)
    })

    // For plain-shell mode (no claude/gemini), honour an explicit initialCommand.
    if (initialCommand) {
      setTimeout(() => {
        if (session.alive && session.ptyProcess) {
          session.ptyProcess.write(autoExecute === true ? initialCommand + '\r' : initialCommand)
        }
      }, INITIAL_COMMAND_DELAY_MS)
    }
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.ptyProcess?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (!session.ptyProcess) {
      // Not yet started — promote first resize into start().
      this.start(id, cols, rows)
      return
    }
    if (session.alive) {
      session.ptyProcess.resize(Math.max(1, cols), Math.max(1, rows))
    }
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      if (session.alive && session.ptyProcess) {
        session.ptyProcess.kill()
      }
      disposeSession(session.claudeSessionId)
      this.sessions.delete(id)
    }
  }

  getSession(id: string): PtySession | undefined {
    return this.sessions.get(id)
  }

  getAllSessions(): { id: string; cwd: string; folderName: string; alive: boolean }[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      cwd: s.cwd,
      folderName: s.folderName,
      alive: s.alive
    }))
  }

  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
  }
}

// Re-export the default constants so existing imports remain valid.
export { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS }

export const ptyManager = new PtyManager()
