import { ipcMain, BrowserWindow } from 'electron'
import { windowRegistry, type WindowIdentity } from '../window-registry'
import { workspaceManager } from '../workspace-manager'

/** What a renderer learns about itself, and only itself: its window id, the
 *  workspace it shows, whether it is the primary, and the workspaces it
 *  hosts (may write for). Pushed again as `window:workspace-changed` every
 *  time hosting moves — a window opened, closed, or switched, a workspace
 *  registered or removed. */
export function identityFor(windowId: number): WindowIdentity | null {
  return windowRegistry.identityOf(
    windowId,
    workspaceManager.getWorkspaces().map((w) => w.id)
  )
}

export function pushIdentity(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const identity = identityFor(win.id)
  if (identity) win.webContents.send('window:workspace-changed', identity)
}

export function broadcastIdentities(): void {
  for (const win of windowRegistry.listWindows()) pushIdentity(win)
}

export interface WindowHandlerDeps {
  /** Open (or focus) the window showing a workspace — lives in main/index.ts
   *  next to createWindow; injected so this module never imports the entry. */
  openWorkspaceWindow: (workspaceId: string) => { windowId: number; focusedExisting: boolean }
}

export type SetWorkspaceResult =
  | { ok: true }
  | { ok: false; reason: 'shown-elsewhere'; shownIn: number }
  | { ok: false; reason: 'unknown-workspace' | 'no-window' }

export function registerWindowHandlers(deps: WindowHandlerDeps): void {
  ipcMain.handle('window:identity', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? identityFor(win.id) : null
  })

  // A renderer switching its workspace asks main FIRST. The guard that keeps
  // mirroring out of scope lives here: a workspace another window shows is
  // never switched to — that window is brought forward instead, and the
  // caller keeps its view. On success the sender's hosting moves and every
  // window learns its new hosted set.
  ipcMain.handle(
    'window:set-workspace',
    (event, workspaceId: string | null): SetWorkspaceResult => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { ok: false, reason: 'no-window' }
      const target = typeof workspaceId === 'string' ? workspaceId : null
      if (target !== null && !workspaceManager.isRegistered(target)) {
        return { ok: false, reason: 'unknown-workspace' }
      }
      if (target !== null) {
        const shown = windowRegistry.getWindowForWorkspace(target)
        if (shown && shown.id !== win.id) {
          if (shown.isMinimized()) shown.restore()
          shown.show()
          shown.focus()
          return { ok: false, reason: 'shown-elsewhere', shownIn: shown.id }
        }
      }
      windowRegistry.setWindowWorkspace(win.id, target)
      broadcastIdentities()
      return { ok: true }
    }
  )

  // The single reach for "show workspace W in a window": the File menu and
  // the picker (slice 3), clave_open_window (slice 4), and the end-to-end
  // harness all come through here.
  ipcMain.handle('window:open', (_event, workspaceId: string) => {
    if (typeof workspaceId !== 'string' || !workspaceManager.isRegistered(workspaceId)) {
      throw new Error(`No registered workspace with id "${String(workspaceId)}"`)
    }
    return deps.openWorkspaceWindow(workspaceId)
  })
}
