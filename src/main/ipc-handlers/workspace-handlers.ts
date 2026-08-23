import { ipcMain, BrowserWindow } from 'electron'
import { workspaceManager } from '../workspace-manager'
import { windowRegistry } from '../window-registry'
import type { Workspace } from '../../shared/workspace-types'
import { broadcastIdentities } from './window-handlers'

/** Registry/pin changes reach every OTHER window, which folds them into its
 *  stores (registry and pins only — never groups or sessions). The sender
 *  already has the state; sending it back would race its next mutation. */
function broadcastStateChanged(sender: Electron.WebContents): void {
  const { workspaces, pins } = workspaceManager.load()
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.id === sender.id) continue
    win.webContents.send('workspace:state-changed', { workspaces, pins })
  }
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

  ipcMain.handle('workspace:update-registry', (event, workspaces: Workspace[]) => {
    workspaceManager.updateRegistry(workspaces)
    broadcastStateChanged(event.sender)
    // A workspace added or removed changes what the primary hosts.
    broadcastIdentities()
    return { ok: true as const }
  })

  // The hosting rule applies to pins too: a window writes the pins of a
  // workspace it hosts. 'all' (the one-time localStorage import) is the
  // primary's alone.
  ipcMain.handle(
    'workspace:update-pins',
    (event, scope: string | null | 'all', pins: unknown[]) => {
      const sender = BrowserWindow.fromWebContents(event.sender)
      const allowed =
        !!sender &&
        (scope === 'all'
          ? windowRegistry.isPrimary(sender.id)
          : windowRegistry.canWriteWorkspace(sender.id, scope))
      if (!allowed) {
        const host =
          scope && scope !== 'all'
            ? windowRegistry.getHostWindowForWorkspace(scope)
            : windowRegistry.getPrimaryWindow()
        console.error(
          `[workspace] refused: window ${sender?.id ?? '?'} may not write pins of workspace ${scope ?? '(unscoped)'} — hosted by window ${host?.id ?? '?'}`
        )
        return { ok: false as const, reason: 'not-host' as const, hostWindowId: host?.id ?? null }
      }
      workspaceManager.updatePins(scope, pins)
      broadcastStateChanged(event.sender)
      return { ok: true as const }
    }
  )

  ipcMain.handle('workspace:set-last-active', (_event, workspaceId: string | null) => {
    workspaceManager.setLastActive(typeof workspaceId === 'string' ? workspaceId : null)
    return { ok: true as const }
  })
}
