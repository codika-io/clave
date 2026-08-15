import { ipcMain } from 'electron'
import { workspaceManager } from '../workspace-manager'
import type { WorkspaceStateFile } from '../../shared/workspace-types'

/** Deliberately dumb load/save of the whole workspace state file, mirroring
 *  sidebar-layout: the renderer owns the state during a run and persists every
 *  mutation; main keeps a synchronous cache so the PTY layer can stamp spawns
 *  with the active workspace without an async hop. */
export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:load', () => {
    return workspaceManager.load()
  })

  ipcMain.handle('workspace:save', (_event, data: WorkspaceStateFile) => {
    workspaceManager.save(data)
  })
}
