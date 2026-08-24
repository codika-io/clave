import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { windowRegistry, type WindowIdentity } from '../window-registry'
import { workspaceManager } from '../workspace-manager'
import { ptyManager, sessionRecordsDir } from '../pty-manager'

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

/** Session ids of `workspaceIds` that are LIVE in this app and hosted by a
 *  window other than the asker. A window taking over a workspace's layout
 *  must not prune the groups of sessions that merely live elsewhere — the
 *  records carry each session's workspace; adoption keeps the record's id,
 *  so a live session is found by that id. */
function liveSessionsElsewhere(askerWindowId: number, workspaceIds: string[]): string[] {
  const wanted = new Set(workspaceIds)
  const out: string[] = []
  let files: string[] = []
  try {
    files = fs.readdirSync(sessionRecordsDir()).filter((f) => f.endsWith('.json'))
  } catch {
    return out
  }
  for (const file of files) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(sessionRecordsDir(), file), 'utf-8')) as {
        id?: unknown
        workspaceId?: unknown
        cwd?: unknown
      }
      if (typeof meta.id !== 'string') continue
      const ws =
        typeof meta.workspaceId === 'string'
          ? meta.workspaceId
          : typeof meta.cwd === 'string'
            ? workspaceManager.resolveWorkspaceForCwd(meta.cwd)
            : null
      if (!ws || !wanted.has(ws)) continue
      if (!ptyManager.getSession(meta.id)) continue
      const host = windowRegistry.getWindowForSession(meta.id)
      if (host && host.id === askerWindowId) continue
      out.push(meta.id)
    } catch {
      /* skip malformed record */
    }
  }
  return out
}

/**
 * Move every LIVE tmux session of `workspaceId` that another window hosts to
 * the window `targetWindowId` (§3.6 re-homing). For each such session: detach
 * its pty (`kill(id, false)` keeps the tmux session and its record alive),
 * unbind it, tell its OLD host to drop the tab (a MOVE, not a death — the tab
 * is removed without touching the pty), then hand the ids to the target, whose
 * renderer re-adopts them (reattaching to the same tmux session, scrollback
 * intact, the id preserved so MCP addressing and exchange capture survive).
 * Non-tmux sessions are never re-homed (their pty would die) — they stay
 * hidden with their current host.
 */
export function rehomeWorkspaceToWindow(workspaceId: string, targetWindowId: number): void {
  const target = windowRegistry.getWindow(targetWindowId)
  if (!target) return
  const ids = liveSessionsElsewhere(targetWindowId, [workspaceId])
  if (ids.length === 0) return
  for (const id of ids) {
    const oldHost = windowRegistry.getWindowForSession(id)
    // Tell the old host to drop the tab FIRST, so its terminal unmounts before
    // the detach's pty:exit could paint "[Session ended]" on a moving tab.
    if (oldHost && oldHost.id !== target.id) {
      oldHost.webContents.send('session:removed-for-rehome', id)
    }
    ptyManager.kill(id, false) // detach: tmux session and record survive
    windowRegistry.unbindSession(id)
  }
  target.webContents.send('session:rehome', ids)
}

export function registerWindowHandlers(deps: WindowHandlerDeps): void {
  // Pull a workspace's live sessions to the calling window (a fresh window
  // opened on W, or a window switched to W).
  ipcMain.handle('window:rehome-workspace', (event, workspaceId: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && typeof workspaceId === 'string') rehomeWorkspaceToWindow(workspaceId, win.id)
    return { ok: true as const }
  })

  // Release a workspace this window stopped showing back to the primary (its
  // sessions become hidden-hosted there again). No-op when the caller IS the
  // primary — it hosts every unshown workspace already.
  ipcMain.handle('window:release-workspace', (event, workspaceId: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || typeof workspaceId !== 'string') return { ok: true as const }
    if (windowRegistry.isPrimary(win.id)) return { ok: true as const }
    const primary = windowRegistry.getPrimaryWindow()
    if (primary) rehomeWorkspaceToWindow(workspaceId, primary.id)
    return { ok: true as const }
  })

  ipcMain.handle('window:identity', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? identityFor(win.id) : null
  })

  // A renderer switching its workspace asks main FIRST. The guard that keeps
  // mirroring out of scope lives here: a workspace another window shows is
  // never switched to — that window is brought forward instead (unless the
  // caller is only probing, `focus: false`), and the caller keeps its view.
  // On success the sender's hosting moves and every window learns its new
  // hosted set.
  ipcMain.handle(
    'window:set-workspace',
    (event, workspaceId: unknown, options?: { focus?: unknown }): SetWorkspaceResult => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { ok: false, reason: 'no-window' }
      const target = typeof workspaceId === 'string' ? workspaceId : null
      if (target !== null && !workspaceManager.isRegistered(target)) {
        return { ok: false, reason: 'unknown-workspace' }
      }
      if (target !== null) {
        const shown = windowRegistry.getWindowForWorkspace(target)
        if (shown && shown.id !== win.id) {
          if (options?.focus !== false) {
            if (shown.isMinimized()) shown.restore()
            shown.show()
            shown.focus()
          }
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
  ipcMain.handle('window:open', (_event, workspaceId: unknown) => {
    if (typeof workspaceId !== 'string' || !workspaceManager.isRegistered(workspaceId)) {
      throw new Error(`No registered workspace with id "${String(workspaceId)}"`)
    }
    return deps.openWorkspaceWindow(workspaceId)
  })

  ipcMain.handle('sessions:live-elsewhere', (event, workspaceIds: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !Array.isArray(workspaceIds)) return []
    return liveSessionsElsewhere(
      win.id,
      workspaceIds.filter((w): w is string => typeof w === 'string')
    )
  })
}
