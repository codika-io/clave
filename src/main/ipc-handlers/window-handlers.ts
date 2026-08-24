import { ipcMain, BrowserWindow } from 'electron'
import { windowRegistry, type WindowIdentity } from '../window-registry'
import { workspaceManager } from '../workspace-manager'
import { windowState } from '../window-state'
import { ptyManager } from '../pty-manager'
import { sidebarLayoutManager, type SidebarLayout } from '../sidebar-layout-manager'
import { TEST_NO_ACTIVATE } from '../test-mode'

/** What a renderer learns about itself, and only itself: its window id, its
 *  persisted key, the workspace it shows, whether it is the primary. Pushed
 *  again as `window:identity-changed` when the primary is re-elected. */
export function identityFor(windowId: number): WindowIdentity | null {
  return windowRegistry.identityOf(windowId)
}

export function pushIdentity(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const identity = identityFor(win.id)
  if (identity) win.webContents.send('window:identity-changed', identity)
}

export function broadcastIdentities(): void {
  for (const win of windowRegistry.listWindows()) pushIdentity(win)
}

export interface WindowHandlerDeps {
  /** Open a new window on a workspace — lives in main/index.ts next to
   *  createWindow; injected so this module never imports the entry. */
  openWindow: (workspaceId: string | null) => { windowId: number }
}

/** What a target window receives to take in sessions (and, on a window
 *  close, the closing window's groups with them). */
export interface RehomePayload {
  sessionIds: string[]
  layout: SidebarLayout | null
}

export interface MoveResult {
  moved: string[]
  /** Sessions that could not move and why: not live, or not tmux-backed (a
   *  plain pty's scrollback lives in one renderer and cannot be re-attached). */
  refused: { sessionId: string; reason: 'not-live' | 'not-tmux' | 'same-window' }[]
}

// ── Re-homing ────────────────────────────────────────────────────────────────

/** Renderers acknowledge `session:rehome` once the adoption ran, so a caller
 *  that must act on the moved session in its new window (an MCP move into a
 *  group there) can wait for it. */
const rehomeWaiters = new Map<string, (() => void)[]>()
const rehomed = new Set<string>()

export function awaitRehomed(sessionIds: string[], timeoutMs = 10_000): Promise<void> {
  return Promise.all(
    sessionIds.map(
      (id) =>
        new Promise<void>((resolve) => {
          if (rehomed.delete(id)) return resolve()
          const timer = setTimeout(() => {
            const list = rehomeWaiters.get(id) ?? []
            rehomeWaiters.set(
              id,
              list.filter((f) => f !== done)
            )
            resolve()
          }, timeoutMs)
          const done = (): void => {
            clearTimeout(timer)
            resolve()
          }
          rehomeWaiters.set(id, [...(rehomeWaiters.get(id) ?? []), done])
        })
    )
  ).then(() => undefined)
}

function markRehomed(sessionIds: string[]): void {
  for (const id of sessionIds) {
    const waiters = rehomeWaiters.get(id)
    if (waiters && waiters.length > 0) {
      rehomeWaiters.delete(id)
      for (const w of waiters) w()
    } else {
      rehomed.add(id)
    }
  }
}

/**
 * Move live sessions to the window `targetWindowId`. For each tmux-backed
 * session hosted elsewhere: tell its old host to drop the tab (a MOVE, not a
 * death — the tab is removed without touching the pty), detach the pty
 * (`kill(id, false)` keeps the tmux session and its record alive), unbind,
 * then hand the ids to the target, whose renderer re-adopts them
 * (reattaching to the same tmux session, scrollback intact, the id preserved
 * so MCP addressing and exchange capture survive). A plain-pty session is
 * refused: its process would die with the detach.
 */
export function moveSessionsToWindow(
  sessionIds: string[],
  targetWindowId: number,
  layout: SidebarLayout | null = null
): MoveResult {
  const target = windowRegistry.getWindow(targetWindowId)
  const result: MoveResult = { moved: [], refused: [] }
  if (!target) {
    for (const id of sessionIds) result.refused.push({ sessionId: id, reason: 'not-live' })
    return result
  }
  for (const id of sessionIds) {
    const session = ptyManager.getSession(id)
    if (!session) {
      result.refused.push({ sessionId: id, reason: 'not-live' })
      continue
    }
    const oldHost = windowRegistry.getWindowForSession(id)
    if (oldHost && oldHost.id === target.id) {
      result.refused.push({ sessionId: id, reason: 'same-window' })
      continue
    }
    if (!session.tmuxName) {
      result.refused.push({ sessionId: id, reason: 'not-tmux' })
      continue
    }
    // Tell the old host to drop the tab FIRST, so its terminal unmounts before
    // the detach's pty:exit could paint "[Session ended]" on a moving tab.
    if (oldHost) oldHost.webContents.send('session:removed-for-rehome', id)
    ptyManager.kill(id, false) // detach: tmux session and record survive
    windowRegistry.unbindSession(id)
    result.moved.push(id)
  }
  if (result.moved.length > 0 || (layout && layout.groups.length > 0)) {
    const payload: RehomePayload = { sessionIds: result.moved, layout }
    target.webContents.send('session:rehome', payload)
  }
  return result
}

export function registerWindowHandlers(deps: WindowHandlerDeps): void {
  ipcMain.handle('window:identity', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? identityFor(win.id) : null
  })

  ipcMain.handle('window:list', () =>
    windowRegistry
      .listWindows()
      .map((w) => identityFor(w.id))
      .filter((i): i is WindowIdentity => i !== null)
  )

  // A window switching its workspace tells main FIRST, so the registry is
  // current when the next pty:spawn stamps its record (IPC is FIFO). Any
  // window may show any workspace; the switch is persisted so the window
  // comes back on it, and becomes the last-active default.
  ipcMain.handle('window:set-workspace', (event, workspaceId: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { ok: false as const, reason: 'no-window' as const }
    const target = typeof workspaceId === 'string' ? workspaceId : null
    if (target !== null && !workspaceManager.isRegistered(target)) {
      return { ok: false as const, reason: 'unknown-workspace' as const }
    }
    windowRegistry.setWindowWorkspace(win.id, target)
    const key = windowRegistry.getKeyForWindow(win.id)
    if (key) windowState.upsert(key, { workspaceId: target })
    workspaceManager.setLastActive(target)
    return { ok: true as const }
  })

  // The single reach for "a new window": the File menu, the popover, the
  // clave_open_window tool and the end-to-end harness all come through here.
  // No workspace → the asking window's own (the app once more, where you are).
  ipcMain.handle('window:open', (event, workspaceId?: unknown) => {
    let target: string | null
    if (typeof workspaceId === 'string') {
      if (!workspaceManager.isRegistered(workspaceId)) {
        throw new Error(`No registered workspace with id "${workspaceId}"`)
      }
      target = workspaceId
    } else {
      const win = BrowserWindow.fromWebContents(event.sender)
      target =
        (win ? windowRegistry.getWorkspaceForWindow(win.id) : null) ??
        workspaceManager.resolveInitialWorkspaceId()
    }
    return deps.openWindow(target)
  })

  ipcMain.handle('window:focus', (_event, windowId: unknown) => {
    const win = typeof windowId === 'number' ? windowRegistry.getWindow(windowId) : null
    if (!win) return { ok: false as const }
    // Under --test-no-activate the OS-level bring-forward is skipped: a test
    // instance must never steal the desktop's focus.
    if (!TEST_NO_ACTIVATE) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
    return { ok: true as const }
  })

  ipcMain.handle(
    'window:move-sessions',
    (_event, sessionIds: unknown, targetWindowId: unknown): MoveResult => {
      const ids = Array.isArray(sessionIds)
        ? sessionIds.filter((x): x is string => typeof x === 'string')
        : []
      if (typeof targetWindowId !== 'number') {
        return { moved: [], refused: ids.map((id) => ({ sessionId: id, reason: 'not-live' })) }
      }
      return moveSessionsToWindow(ids, targetWindowId)
    }
  )

  // A group moves whole: the target window takes the group object (with its
  // session ids) into its sidebar, then the live members follow through the
  // session move. The source renderer drops its copy of the group on the
  // `ok`; members that could not move are reported so it can keep them.
  ipcMain.handle(
    'window:move-group',
    (event, group: unknown, targetWindowId: unknown): MoveResult & { ok: boolean } => {
      const g = group as { id?: unknown; sessionIds?: unknown } | null
      const target = typeof targetWindowId === 'number' ? windowRegistry.getWindow(targetWindowId) : null
      const sender = BrowserWindow.fromWebContents(event.sender)
      if (!target || !g || typeof g.id !== 'string' || (sender && sender.id === target.id)) {
        return { ok: false, moved: [], refused: [] }
      }
      const ids = Array.isArray(g.sessionIds)
        ? g.sessionIds.filter((x): x is string => typeof x === 'string')
        : []
      const layout: SidebarLayout = { groups: [group], displayOrder: [g.id] }
      const outcome = moveSessionsToWindow(ids, target.id, layout)
      // The source drops its copy of the group; members that could not move
      // stay behind as plain tabs (the renderer keeps them out of the group).
      if (sender && !sender.isDestroyed()) sender.webContents.send('group:removed-for-move', g.id)
      return { ok: true, ...outcome }
    }
  )

  // The renderer's acknowledgement that `session:rehome` was adopted.
  ipcMain.on('window:rehomed', (_event, sessionIds: unknown) => {
    if (Array.isArray(sessionIds)) {
      markRehomed(sessionIds.filter((x): x is string => typeof x === 'string'))
    }
  })
}

/** The closing window's groups, handed to the primary with its sessions, and
 *  its file removed: the primary persists what it absorbed into its own. */
export function takeClosingLayout(windowKey: string): SidebarLayout {
  const layout = sidebarLayoutManager.loadForWindow(windowKey)
  sidebarLayoutManager.deleteForWindow(windowKey)
  return layout
}
