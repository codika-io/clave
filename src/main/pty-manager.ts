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

export interface PtySession {
  id: string
  cwd: string
  folderName: string
  ptyProcess: pty.IPty
  alive: boolean
  claudeSessionId?: string
}

class PtyManager {
  private sessions = new Map<string, PtySession>()

  spawn(cwd: string, options?: PtySpawnOptions): PtySession {
    const id = randomUUID()
    const folderName = (isWindows ? cwd.split('\\') : cwd.split('/')).pop() || cwd
    const useClaudeMode = options?.claudeMode !== false && !options?.geminiMode
    const useGeminiMode = options?.geminiMode === true

    // For Claude mode: generate a session ID upfront (or reuse one for resume)
    let claudeSessionId: string | undefined
    let shellArgs: string[]
    if (isWindows) {
      // On Windows, use cmd.exe with /k to launch cli (keeps shell alive on exit/error)
      if (useGeminiMode) {
        shellArgs = ['/k', 'gemini']
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
        if (options?.dangerousMode) {
          parts.push('--dangerously-skip-permissions')
        }
        const settingsPath = prepareSessionSettings(claudeSessionId, id)
        if (settingsPath) parts.push('--settings', settingsPath)
        shellArgs = ['/k', ...parts]
      }
    } else {
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
        if (options?.dangerousMode) {
          parts.push('--dangerously-skip-permissions')
        }
        const settingsPath = prepareSessionSettings(claudeSessionId, id)
        if (settingsPath) parts.push('--settings', settingsPath)
        shellArgs = ['-l', '-c', parts.join(' ')]
      }
    }

    const shellName = getUserShell()
    const ptyName = isWindows ? undefined : 'xterm-256color'

    const ptyProcess = pty.spawn(shellName, shellArgs, {
      name: ptyName,
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
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

    const session: PtySession = { id, cwd, folderName, ptyProcess, alive: true }
    if (claudeSessionId) session.claudeSessionId = claudeSessionId
    this.sessions.set(id, session)

    ptyProcess.onExit(() => {
      session.alive = false
      disposeSession(claudeSessionId)
    })

    // Write initial command after shell init
    if (options?.initialCommand) {
      const cmd = options.initialCommand
      const execute = options.autoExecute === true
      setTimeout(() => {
        if (session.alive) {
          ptyProcess.write(execute ? cmd + '\r' : cmd)
        }
      }, INITIAL_COMMAND_DELAY_MS)
    }

    return session
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.ptyProcess.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (session?.alive) {
      session.ptyProcess.resize(cols, rows)
    }
  }

  kill(id: string): void {
    const session = this.sessions.get(id) as (PtySession & { claudeSessionId?: string }) | undefined
    if (session) {
      if (session.alive) {
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

export const ptyManager = new PtyManager()
