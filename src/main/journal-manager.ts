// src/main/journal-manager.ts
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface JournalProject {
  cwd: string
  name: string
  entries: JournalEntry[]
}

export interface JournalEntry {
  sessionId: string
  claudeSessionId?: string
  sessionName: string
  summary?: string
  startTime: number
  endTime?: number
  status: 'active' | 'completed'
}

export interface JournalData {
  date: string
  projects: JournalProject[]
}

class JournalManager {
  private filePath: string

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'assistant-journal.json')
  }

  load(): JournalData {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw) as JournalData
    } catch {
      return { date: '', projects: [] }
    }
  }

  save(data: JournalData): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }
}

export const journalManager = new JournalManager()
