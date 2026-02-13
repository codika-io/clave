import * as pty from 'node-pty'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'

let loginShellPath: string | null = null

function getLoginShellPath(): string {
  if (loginShellPath !== null) return loginShellPath
  try {
    const output = execSync('/bin/zsh -lic "echo __PATH__$PATH"', { encoding: 'utf-8' })
    const marker = output.split('\n').find((l) => l.startsWith('__PATH__'))
    loginShellPath = marker ? marker.slice('__PATH__'.length) : process.env.PATH || ''
  } catch {
    loginShellPath = process.env.PATH || ''
  }
  return loginShellPath
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

  spawn(cwd: string, options?: { dangerousMode?: boolean }): PtySession {
    const id = randomUUID()
    const folderName = cwd.split('/').pop() || cwd
    const claudeCmd = options?.dangerousMode
      ? 'claude --dangerously-skip-permissions'
      : 'claude'

    const ptyProcess = pty.spawn('/bin/zsh', ['-l', '-c', claudeCmd], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        PATH: getLoginShellPath(),
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
