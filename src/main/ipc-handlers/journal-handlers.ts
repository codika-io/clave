// src/main/ipc-handlers/journal-handlers.ts
import { ipcMain } from 'electron'
import { journalManager } from '../journal-manager'
import type { JournalData } from '../../shared/journal-types'
import { summarizeSession } from '../session-summarizer'

const MAX_JOURNAL_SIZE = 1024 * 1024 // 1MB

function isValidJournalData(data: unknown): data is JournalData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false
  const obj = data as Record<string, unknown>
  if (typeof obj.date !== 'string') return false
  if (!Array.isArray(obj.projects)) return false
  return true
}

export function registerJournalHandlers(): void {
  ipcMain.handle('journal:load', () => journalManager.load())

  ipcMain.handle('journal:save', (_event, data) => {
    if (!isValidJournalData(data)) {
      console.error('[journal-handlers] Invalid journal data shape')
      return
    }
    const serialized = JSON.stringify(data)
    if (serialized.length > MAX_JOURNAL_SIZE) {
      console.error('[journal-handlers] Journal data exceeds 1MB limit')
      return
    }
    return journalManager.save(data)
  })

  ipcMain.handle('journal:summarize', (_event, claudeSessionId: string, cwd: string) =>
    summarizeSession(claudeSessionId, cwd)
  )

  ipcMain.handle('journal:archive', (_event, data) => {
    if (!isValidJournalData(data) || !data.date) return
    return journalManager.archive(data)
  })
}
