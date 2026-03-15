import * as pty from 'node-pty'
import { execFile, execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS, INITIAL_COMMAND_DELAY_MS } from './constants'

let loginShellEnv: Record<string, string> | null = null

function getUserShell(): string {
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
 * Call this at app startup so that by the time the first PTY is spawned,
 * the env is already cached and no blocking execFileSync is needed.
 */
export function preloadLoginShellEnv(): void {
  if (loginShellEnv !== null) return
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

export interface PtySession {
  id: string
  cwd: string
  folderName: string
  ptyProcess: pty.IPty
  alive: boolean
}

class PtyManager {
  private sessions = new Map<string, PtySession>()

  spawn(cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean; resumeSessionId?: string; claudeSessionId?: string; initialCommand?: string; autoExecute?: boolean }): PtySession & { claudeSessionId?: string } {
    const id = randomUUID()
    const folderName = cwd.split('/').pop() || cwd
    const useClaudeMode = options?.claudeMode !== false

    // For Claude mode: generate a session ID upfront (or reuse one for resume)
    let claudeSessionId: string | undefined
    let shellArgs: string[]
    if (!useClaudeMode) {
      shellArgs = ['-l']
    } else {
      const parts = ['claude']
      if (options?.resumeSessionId) {
        parts.push('--resume', options.resumeSessionId)
        claudeSessionId = options.resumeSessionId
      } else {
        // Generate a new Claude session ID and pass it explicitly
        claudeSessionId = options?.claudeSessionId ?? randomUUID()
        parts.push('--session-id', claudeSessionId)
      }
      if (options?.dangerousMode) {
        parts.push('--dangerously-skip-permissions')
      }
      shellArgs = ['-l', '-c', parts.join(' ')]
    }

    const ptyProcess = pty.spawn(getUserShell(), shellArgs, {
      name: 'xterm-256color',
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

    const session: PtySession & { claudeSessionId?: string } = { id, cwd, folderName, ptyProcess, alive: true, claudeSessionId }
    this.sessions.set(id, session)

    ptyProcess.onExit(() => {
      session.alive = false
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
    const session = this.sessions.get(id)
    if (session) {
      if (session.alive) {
        session.ptyProcess.kill()
      }
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
