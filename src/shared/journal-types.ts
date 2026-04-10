// Shared journal types used by main, preload, and renderer

export interface JournalEntry {
  sessionId: string
  claudeSessionId?: string
  sessionName: string
  summary?: string
  startTime: number
  endTime?: number
  status: 'active' | 'completed'
}

export interface JournalProject {
  cwd: string
  name: string
  entries: JournalEntry[]
}

export interface JournalData {
  date: string
  projects: JournalProject[]
}
