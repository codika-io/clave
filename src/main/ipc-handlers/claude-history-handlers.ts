import { ipcMain } from 'electron'
import {
  listClaudeHistoryProjects,
  loadClaudeHistoryMessages,
  loadClaudeHistorySessions,
  searchClaudeHistoryMessages,
  type ClaudeHistoryRoleFilter
} from '../claude-history'

export function registerClaudeHistoryHandlers(): void {
  ipcMain.handle('claude-history:list-projects', async () => {
    return listClaudeHistoryProjects()
  })

  ipcMain.handle('claude-history:load-sessions', async (_event, projectId: string) => {
    return loadClaudeHistorySessions(projectId)
  })

  ipcMain.handle('claude-history:load-messages', async (_event, sourcePath: string) => {
    return loadClaudeHistoryMessages(sourcePath)
  })

  ipcMain.handle(
    'claude-history:search',
    async (_event, query: string, roleFilter: ClaudeHistoryRoleFilter = 'all') => {
      return searchClaudeHistoryMessages(query, roleFilter)
    }
  )
}
