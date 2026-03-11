import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface PersistedSession {
  id: string
  cwd: string
  folderName: string
  name: string
  claudeMode: boolean
  dangerousMode: boolean
  claudeSessionId: string | null
}

export interface PersistedGroup {
  id: string
  name: string
  sessionIds: string[]
  collapsed: boolean
  cwd: string | null
  terminals: Array<{
    id: string
    command: string
    commandMode: 'prefill' | 'auto'
    color: string
  }>
  color?: string | null
}

export interface PersistedFileTab {
  id: string
  filePath: string
  name: string
}

export interface PersistedState {
  sessions: PersistedSession[]
  groups: PersistedGroup[]
  displayOrder: string[]
  focusedSessionId: string | null
  selectedSessionIds: string[]
  sidebarOpen: boolean
  sidebarWidth: number
  activeView: string
  theme?: string
  fileTabs?: PersistedFileTab[]
}

class SessionPersistence {
  private filePath: string

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'sessions.json')
  }

  load(): PersistedState | null {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw) as PersistedState
    } catch {
      return null
    }
  }

  save(state: PersistedState): void {
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8')
  }

  clear(): void {
    try {
      fs.unlinkSync(this.filePath)
    } catch {
      // file may not exist
    }
  }
}

export const sessionPersistence = new SessionPersistence()
