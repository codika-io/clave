import { BrowserWindow } from 'electron'
import type { WindowIdentity } from '../shared/workspace-types'

export type { WindowIdentity }

/**
 * The WindowRegistry — the single in-main source of truth for multi-window
 * Clave (PRDCT-1703). It answers three questions and nothing else:
 *
 *   1. which WORKSPACE does each window show (at most one window per
 *      workspace — mirroring one workspace into two windows is out of scope),
 *   2. which WINDOW hosts each live session (the renderer holding its xterm
 *      and receiving its `pty:data`), bound at spawn / adoption / re-home,
 *      unbound at exit,
 *   3. which window is the PRIMARY — the first of the run, re-elected as the
 *      lowest surviving id when it closes while others remain. The primary
 *      hosts every workspace no window shows, and carries app-level
 *      fallbacks.
 *
 * The registry emits nothing; callers route. It is deliberately generic over
 * a minimal `WindowLike` so the class runs in plain node: the unit tests
 * exercise every rule without Electron, and `BrowserWindow.getFocusedWindow`
 * — the one Electron static the resolution ladder needs — is injected. The
 * `windowRegistry` singleton below is the production instance.
 *
 * Nothing here is persisted: BrowserWindow ids restart at 1 on every launch.
 */
export interface WindowLike {
  readonly id: number
  isDestroyed(): boolean
}

export interface WindowRegistryDeps<W extends WindowLike> {
  /** `BrowserWindow.getFocusedWindow`, injected so the registry is electron-free. */
  getFocusedWindow: () => W | null
}

interface Entry<W extends WindowLike> {
  win: W
  workspaceId: string | null
}

export class WindowRegistry<W extends WindowLike = WindowLike> {
  private readonly windows = new Map<number, Entry<W>>()
  private readonly sessionHosts = new Map<string, number>()
  private primaryId: number | null = null

  constructor(private readonly deps: WindowRegistryDeps<W>) {}

  // ── Windows ────────────────────────────────────────────────────────────────

  registerWindow(win: W, workspaceId: string | null): void {
    this.windows.set(win.id, { win, workspaceId })
    if (this.primaryId === null || !this.isLive(this.primaryId)) this.primaryId = win.id
  }

  /** Forget a window (on 'closed'). Its session bindings are dropped — the
   *  teardown ladder detaches those sessions BEFORE calling this, and a
   *  re-home rebinds them through the spawn path — and the primary is
   *  re-elected as the lowest surviving id when the primary itself left. */
  unregisterWindow(windowId: number): void {
    this.windows.delete(windowId)
    for (const [sessionId, host] of this.sessionHosts) {
      if (host === windowId) this.sessionHosts.delete(sessionId)
    }
    if (this.primaryId === windowId) this.primaryId = this.electPrimary()
  }

  setWindowWorkspace(windowId: number, workspaceId: string | null): void {
    const entry = this.windows.get(windowId)
    if (!entry) return
    entry.workspaceId = workspaceId
  }

  getWindow(windowId: number): W | null {
    return this.isLive(windowId) ? this.windows.get(windowId)!.win : null
  }

  /** The window SHOWING a workspace, if any (never the hidden host). */
  getWindowForWorkspace(workspaceId: string): W | null {
    for (const [id, entry] of this.windows) {
      if (entry.workspaceId === workspaceId && this.isLive(id)) return entry.win
    }
    return null
  }

  getWorkspaceForWindow(windowId: number): string | null {
    return this.isLive(windowId) ? this.windows.get(windowId)!.workspaceId : null
  }

  getPrimaryWindow(): W | null {
    if (this.primaryId === null || !this.isLive(this.primaryId)) {
      this.primaryId = this.electPrimary()
    }
    return this.primaryId === null ? null : this.getWindow(this.primaryId)
  }

  isPrimary(windowId: number): boolean {
    return this.getPrimaryWindow()?.id === windowId
  }

  /** The hosting rule: a workspace's sessions are hosted by the window
   *  showing it; a workspace no window shows is hosted by the primary. */
  getHostWindowForWorkspace(workspaceId: string): W | null {
    return this.getWindowForWorkspace(workspaceId) ?? this.getPrimaryWindow()
  }

  /** Every workspace a window may write for (layout file, pin refresh): the
   *  one it shows, plus — for the primary — every registered workspace no
   *  live window shows. `allWorkspaceIds` is the registry of the moment. */
  getHostedWorkspaceIds(windowId: number, allWorkspaceIds: string[]): string[] {
    if (!this.isLive(windowId)) return []
    const own = this.windows.get(windowId)!.workspaceId
    const hosted: string[] = own ? [own] : []
    if (this.isPrimary(windowId)) {
      for (const ws of allWorkspaceIds) {
        if (ws !== own && this.getWindowForWorkspace(ws) === null) hosted.push(ws)
      }
    }
    return hosted
  }

  /** May `windowId` write state scoped to `workspaceId`? True when it shows
   *  that workspace, or when it is the primary and no window shows it. The
   *  null key (no-workspace mode) belongs to the primary alone. */
  canWriteWorkspace(windowId: number, workspaceId: string | null): boolean {
    if (!this.isLive(windowId)) return false
    if (workspaceId === null) return this.isPrimary(windowId)
    const shown = this.getWindowForWorkspace(workspaceId)
    if (shown) return shown.id === windowId
    return this.isPrimary(windowId)
  }

  identityOf(windowId: number, allWorkspaceIds: string[]): WindowIdentity | null {
    if (!this.isLive(windowId)) return null
    return {
      windowId,
      workspaceId: this.windows.get(windowId)!.workspaceId,
      isPrimary: this.isPrimary(windowId),
      hostedWorkspaceIds: this.getHostedWorkspaceIds(windowId, allWorkspaceIds)
    }
  }

  /** Live windows, lowest id first. */
  listWindows(): W[] {
    return [...this.windows.keys()]
      .filter((id) => this.isLive(id))
      .sort((a, b) => a - b)
      .map((id) => this.windows.get(id)!.win)
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  bindSession(sessionId: string, windowId: number): void {
    this.sessionHosts.set(sessionId, windowId)
  }

  unbindSession(sessionId: string): void {
    this.sessionHosts.delete(sessionId)
  }

  getWindowForSession(sessionId: string): W | null {
    const host = this.sessionHosts.get(sessionId)
    return host === undefined ? null : this.getWindow(host)
  }

  getSessionsForWindow(windowId: number): string[] {
    const out: string[] = []
    for (const [sessionId, host] of this.sessionHosts) if (host === windowId) out.push(sessionId)
    return out
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  /** The ladder every UI-landing call resolves through: the subject session's
   *  hosting window → the workspace's host window → the focused window → the
   *  primary → null. Every rung is checked non-destroyed. */
  resolveTargetWindow(opts: { sessionId?: string; workspaceId?: string }): W | null {
    if (opts.sessionId) {
      const bySession = this.getWindowForSession(opts.sessionId)
      if (bySession) return bySession
    }
    if (opts.workspaceId) {
      const byWorkspace = this.getHostWindowForWorkspace(opts.workspaceId)
      if (byWorkspace) return byWorkspace
    }
    const focused = this.deps.getFocusedWindow()
    if (focused && !focused.isDestroyed() && this.windows.has(focused.id)) return focused
    return this.getPrimaryWindow()
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private isLive(windowId: number): boolean {
    const entry = this.windows.get(windowId)
    return !!entry && !entry.win.isDestroyed()
  }

  private electPrimary(): number | null {
    let lowest: number | null = null
    for (const id of this.windows.keys()) {
      if (this.isLive(id) && (lowest === null || id < lowest)) lowest = id
    }
    return lowest
  }
}

/** The production registry. `BrowserWindow` is only touched inside the
 *  injected lookup, never at import — this module stays loadable in node. */
export const windowRegistry = new WindowRegistry<BrowserWindow>({
  getFocusedWindow: () => BrowserWindow.getFocusedWindow()
})
