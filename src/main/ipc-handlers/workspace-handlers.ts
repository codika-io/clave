import { ipcMain, BrowserWindow } from 'electron'
import { workspaceManager } from '../workspace-manager'
import { windowRegistry } from '../window-registry'
import { isValidLayoutKey } from '../sidebar-layout-manager'
import type { Workspace } from '../../shared/workspace-types'
import { broadcastIdentities } from './window-handlers'

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
    // A workspace added or removed changes what the primary hosts.
    broadcastIdentities()
    return { ok: true as const }
  })

  // The hosting rule applies to pins too: a window writes the pins of a
  // workspace it hosts. 'all' (the one-time localStorage import) is the
  // primary's alone. The scope is a partition key and is validated as one.
  ipcMain.handle('workspace:update-pins', (event, scope: unknown, pins: unknown) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    const key: string | null | 'all' | undefined =
      scope === 'all' || scope === null ? scope : isValidLayoutKey(scope) ? scope : undefined
    if (key === undefined || !Array.isArray(pins)) {
      console.error(`[workspace] refused: invalid pins scope ${JSON.stringify(scope)}`)
      return { ok: false as const, reason: 'invalid-key' as const }
    }
    const allowed =
      !!sender &&
      (key === 'all'
        ? windowRegistry.isPrimary(sender.id)
        : windowRegistry.canWriteWorkspace(sender.id, key))
    if (!allowed) {
      const host =
        key && key !== 'all'
          ? windowRegistry.getHostWindowForWorkspace(key)
          : windowRegistry.getPrimaryWindow()
      console.error(
        `[workspace] refused: window ${sender?.id ?? '?'} may not write pins of workspace ${key ?? '(unscoped)'} — hosted by window ${host?.id ?? '?'}`
      )
      return { ok: false as const, reason: 'not-host' as const, hostWindowId: host?.id ?? null }
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
