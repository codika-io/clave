import * as pty from 'node-pty'
import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'

let loginShellEnv: Record<string, string> | null = null

function getUserShell(): string {
  return process.env.SHELL || '/bin/zsh'
}

function getLoginShellEnv(): Record<string, string> {
  if (loginShellEnv !== null) return loginShellEnv
  try {
    const output = execFileSync(getUserShell(), ['-lic', 'env -0'], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    })
    const env: Record<string, string> = {}
    for (const entry of output.split('\0')) {
      const idx = entry.indexOf('=')
      if (idx > 0) {
        env[entry.slice(0, idx)] = entry.slice(idx + 1)
      }
    }
    if (Object.keys(env).length > 0) {
      loginShellEnv = env
    } else {
      loginShellEnv = { ...process.env } as Record<string, string>
    }
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

  spawn(cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean }): PtySession {
    const id = randomUUID()
    const folderName = cwd.split('/').pop() || cwd
    const useClaudeMode = options?.claudeMode !== false

    const shellArgs: string[] = useClaudeMode
      ? ['-l', '-c', options?.dangerousMode ? 'claude --dangerously-skip-permissions' : 'claude']
      : ['-l']

    const ptyProcess = pty.spawn(getUserShell(), shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...getLoginShellEnv(),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    })

    const session: PtySession = { id, cwd, folderName, ptyProcess, alive: true }
    this.sessions.set(id, session)

    ptyProcess.onExit(() => {
      session.alive = false
    })

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
