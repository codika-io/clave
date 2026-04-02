import { ipcMain } from 'electron'
import path from 'path'
import {
  CLAUDE_PROJECTS_ROOT,
  listClaudeHistoryProjects,
  loadClaudeHistoryMessages,
  loadClaudeHistorySessions,
  searchClaudeHistoryMessages,
  type ClaudeHistoryRoleFilter
} from '../claude-history'

function assertInsideProjectsRoot(inputPath: string): void {
  const resolved = path.resolve(inputPath)
  if (!resolved.startsWith(CLAUDE_PROJECTS_ROOT + path.sep) && resolved !== CLAUDE_PROJECTS_ROOT) {
    throw new Error('Access denied: path is outside the allowed projects directory')
  }
}

export function registerClaudeHistoryHandlers(): void {
  ipcMain.handle('claude-history:list-projects', async () => {
    return listClaudeHistoryProjects()
  })

  ipcMain.handle('claude-history:load-sessions', async (_event, projectId: string) => {
    assertInsideProjectsRoot(projectId)
    return loadClaudeHistorySessions(projectId)
  })

  ipcMain.handle('claude-history:load-messages', async (_event, sourcePath: string) => {
    assertInsideProjectsRoot(sourcePath)
    return loadClaudeHistoryMessages(sourcePath)
  })

  ipcMain.handle(
    'claude-history:search',
    async (_event, query: string, roleFilter: ClaudeHistoryRoleFilter = 'all') => {
      return searchClaudeHistoryMessages(query, roleFilter)
    }
  )
}
