// src/main/ipc-handlers/journal-handlers.ts
import { ipcMain } from 'electron'
import { journalManager } from '../journal-manager'
import { summarizeSession } from '../session-summarizer'

export function registerJournalHandlers(): void {
  ipcMain.handle('journal:load', () => journalManager.load())
  ipcMain.handle('journal:save', (_event, data) => journalManager.save(data))
  ipcMain.handle('journal:summarize', (_event, claudeSessionId: string, cwd: string) =>
    summarizeSession(claudeSessionId, cwd)
  )
}
