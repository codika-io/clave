import { ipcMain } from 'electron'
import { workspaceManager } from '../workspace-manager'
import { windowRegistry } from '../window-registry'
import { isValidLayoutKey } from '../sidebar-layout-manager'
import type { Workspace } from '../../shared/workspace-types'

/** Registry/pin changes reach every OTHER window, which folds them into its
 *  stores (registry and pins only — never groups or sessions). The sender
 *  already has the state; sending it back would race its next mutation. */
function broadcastStateChanged(sender: Electron.WebContents): void {
  const { workspaces, pins } = workspaceManager.load()
  for (const win of windowRegistry.listWindows()) {
    if (win.webContents.id === sender.id) continue
    win.webContents.send('workspace:state-changed', { workspaces, pins })
  }
}

/** A renderer can send anything; a registry entry that is not a workspace
 *  would take down every path that reads `rootDir` (session restore among
 *  them). Reject the whole write rather than store one bad entry. */
function isWorkspace(x: unknown): x is Workspace {
  if (typeof x !== 'object' || x === null) return false
  const w = x as Record<string, unknown>
  return (
    isValidLayoutKey(w.id) &&
    typeof w.name === 'string' &&
    typeof w.rootDir === 'string' &&
    w.rootDir.length > 0 &&
    (w.profileFile === null || typeof w.profileFile === 'string') &&
    typeof w.createdAt === 'number'
  )
}

/** The workspace state file, written field by field: the renderer owns the
 *  state during a run and persists every mutation through the channel for
 *  the field it changed; main keeps a synchronous cache so the PTY layer can
 *  stamp spawns without an async hop. The whole-file `workspace:save` is
 *  gone — with several windows it was last-writer-wins on every field. */
export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:load', () => {
    return workspaceManager.load()
  })

  ipcMain.handle('workspace:update-registry', (event, workspaces: unknown) => {
    if (!Array.isArray(workspaces) || !workspaces.every(isWorkspace)) {
      console.error('[workspace] refused: update-registry payload is not a list of workspaces')
      return { ok: false as const, reason: 'invalid' as const }
    }
    workspaceManager.updateRegistry(workspaces)
    broadcastStateChanged(event.sender)
    return { ok: true as const }
  })

  // Pins are per workspace and global to the app: any window writes the
  // partition it changed (a refresh from the .clave files, a pin added or
  // removed), and every other window folds the change in. 'all' is the
  // one-time localStorage import. The scope is a partition key and is
  // validated as one.
  ipcMain.handle('workspace:update-pins', (event, scope: unknown, pins: unknown) => {
    const key: string | null | 'all' | undefined =
      scope === 'all' || scope === null ? scope : isValidLayoutKey(scope) ? scope : undefined
    if (key === undefined || !Array.isArray(pins)) {
      console.error(`[workspace] refused: invalid pins scope ${JSON.stringify(scope)}`)
      return { ok: false as const, reason: 'invalid-key' as const }
    }
    workspaceManager.updatePins(key, pins)
    broadcastStateChanged(event.sender)
    return { ok: true as const }
  })

  ipcMain.handle('workspace:set-last-active', (_event, workspaceId: unknown) => {
    workspaceManager.setLastActive(isValidLayoutKey(workspaceId) ? workspaceId : null)
    return { ok: true as const }
  })
}
