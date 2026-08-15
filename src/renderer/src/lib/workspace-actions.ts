import type { Workspace, WorkspaceStateFile } from '../../../shared/workspace-types'
import { useWorkspaceStore } from '../store/workspace-store'
import {
  usePinnedStore,
  hydratePinnedGroups,
  serializePinnedGroups,
  refreshWorkspacePins,
  type PinnedGroupBlueprint
} from '../store/pinned-store'
import { useSessionStore } from '../store/session-store'

/** Orchestration layer above the stores. The stores stay import-acyclic
 *  (session→workspace, pinned→workspace); everything that has to touch several
 *  of them — activation side effects, add/remove cascades, persistence — lives
 *  here. UI and MCP call these, never store internals. */

// ── Persistence ──────────────────────────────────────────────────────────────
// Same latch pattern as enableSidebarPersistence: hydration must never be able
// to clobber the state file before it has been read.

let persistEnabled = false

export function persistWorkspaceState(): Promise<void> {
  const ws = useWorkspaceStore.getState()
  const data: WorkspaceStateFile = {
    version: 1,
    workspaces: ws.workspaces,
    activeWorkspaceId: ws.activeWorkspaceId,
    pins: serializePinnedGroups(usePinnedStore.getState().pinnedGroups),
    pinsMigrated: true
  }
  return window.electronAPI?.workspaceSave(data) ?? Promise.resolve()
}

function enableWorkspacePersistence(): void {
  if (persistEnabled) return
  persistEnabled = true
  // Pins persist on every pinnedGroups identity change (mutations used to call
  // a localStorage write inline; the subscription replaces that). Workspace
  // registry mutations all run through this module and persist explicitly.
  let prevPins = usePinnedStore.getState().pinnedGroups
  usePinnedStore.subscribe((state) => {
    if (state.pinnedGroups === prevPins) return
    prevPins = state.pinnedGroups
    void persistWorkspaceState()
  })
}

// ── Boot ─────────────────────────────────────────────────────────────────────

/** Renderer-side path prefix test (no node path module here). Roots are
 *  normalized absolute paths; candidate paths come from pin blueprints. */
function isUnderRoot(rootDir: string, p: string): boolean {
  return p === rootDir || p.startsWith(rootDir.endsWith('/') ? rootDir : rootDir + '/')
}

function matchWorkspaceByPath(
  workspaces: Workspace[],
  p: string | null | undefined
): Workspace | null {
  if (!p) return null
  let best: Workspace | null = null
  for (const ws of workspaces) {
    if (isUnderRoot(ws.rootDir, p) && (!best || ws.rootDir.length > best.rootDir.length)) {
      best = ws
    }
  }
  return best
}

function dirOf(filePath: string): string {
  return filePath.replace(/[\\/][^\\/]*$/, '') || filePath
}

/** Migration Phase B: import the retired localStorage pin store into the new
 *  workspace state file, stamping each pin by path against registered roots.
 *  File-backed pins that match no root are dropped — they are recoverable by
 *  re-registering their root folder as a workspace (this is also the cleanup
 *  that removes orphans from workspaces that left the old registry uncleanly).
 *  Ad-hoc pins (no filePath) are unrecoverable, so they are never dropped:
 *  matched by cwd, else stamped to the active workspace. */
function migrateLocalStoragePins(
  workspaces: Workspace[],
  activeWorkspaceId: string | null
): PinnedGroupBlueprint[] {
  let legacy: PinnedGroupBlueprint[] = []
  try {
    legacy = JSON.parse(localStorage.getItem('clave-pinned-groups') ?? '[]')
  } catch {
    legacy = []
  }

  const migrated: PinnedGroupBlueprint[] = []
  for (const bp of legacy) {
    if (bp.filePath) {
      const candidate =
        bp.workspaceRoot ??
        bp.rootDir ??
        dirOf(bp.filePath) ??
        (bp.discoveredBy ? dirOf(bp.discoveredBy) : null)
      const ws = matchWorkspaceByPath(workspaces, candidate)
      if (!ws) continue // orphan — see doc comment
      migrated.push({ ...bp, workspaceId: ws.id })
    } else {
      const ws = matchWorkspaceByPath(workspaces, bp.cwd)
      migrated.push({ ...bp, workspaceId: ws?.id ?? activeWorkspaceId })
    }
  }
  return migrated
}

/** Boot hydration — the single owner (called from AppShell's boot effect,
 *  before session adoption so adoption can stamp against the registry). */
export async function bootWorkspaces(): Promise<void> {
  const state = await window.electronAPI?.workspaceLoad?.().catch(() => null)
  const workspaces = state?.workspaces ?? []
  const activeWorkspaceId = state?.activeWorkspaceId ?? null

  useWorkspaceStore.setState({ workspaces, activeWorkspaceId, loaded: true })

  let pins: PinnedGroupBlueprint[]
  if (state && !state.pinsMigrated) {
    pins = migrateLocalStoragePins(workspaces, activeWorkspaceId)
  } else {
    pins = (state?.pins ?? []) as PinnedGroupBlueprint[]
  }

  // Reconciliation: a pin stamped with a workspace that is no longer
  // registered can never be shown or refreshed — drop it. This is what makes
  // the old "orphaned pins pile up forever" state structurally impossible.
  const validIds = new Set(workspaces.map((w) => w.id))
  pins = pins.filter((p) => p.workspaceId == null || validIds.has(p.workspaceId))

  hydratePinnedGroups(pins)
  enableWorkspacePersistence()

  if (state && !state.pinsMigrated) {
    // Persist the migrated pins (flips pinsMigrated true), then retire the
    // localStorage key for good.
    await persistWorkspaceState()
    localStorage.removeItem('clave-pinned-groups')
  }
}

/** Post-adoption boot tail: refresh the active workspace's pins from its
 *  files. Separate from bootWorkspaces so adoption doesn't wait on file IO. */
export async function refreshActiveWorkspacePins(): Promise<void> {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
  const active = workspaces.find((w) => w.id === activeWorkspaceId)
  if (active) await refreshWorkspacePins(active)
}

// ── Workspace mutations ──────────────────────────────────────────────────────

/** Pure view switch. Persists BEFORE returning so the main-process cache is
 *  current when the next pty:spawn stamps its record (IPC is FIFO). */
export async function setActiveWorkspace(id: string): Promise<void> {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
  if (id === activeWorkspaceId) return
  const target = workspaces.find((w) => w.id === id)
  if (!target) return

  useWorkspaceStore.setState({ activeWorkspaceId: id })
  await persistWorkspaceState()
  useSessionStore.getState().applyWorkspaceSwitch(activeWorkspaceId, id)
  // Refresh from files in the background — the switch itself must be instant.
  void refreshWorkspacePins(target)
}

export function cycleWorkspace(dir: 1 | -1): void {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
  if (workspaces.length < 2) return
  const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId)
  const next = workspaces[(idx + dir + workspaces.length) % workspaces.length]
  void setActiveWorkspace(next.id)
}

function workspaceNameFromRoot(rootDir: string): string {
  const base = rootDir.split(/[\\/]/).pop()?.replace(/^\.+/, '') ?? ''
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : rootDir
}

/** Register a root folder as a workspace. Returns null (with no state change)
 *  when the root nests inside — or swallows — an existing workspace root. */
export async function addWorkspace(
  rootDir: string,
  profileFile: string | null,
  name?: string
): Promise<Workspace | null> {
  const { workspaces } = useWorkspaceStore.getState()
  const clean = rootDir.replace(/\/+$/, '')
  for (const ws of workspaces) {
    if (isUnderRoot(ws.rootDir, clean) || isUnderRoot(clean, ws.rootDir)) return null
  }

  await window.electronAPI?.trustWorkspaceRoot(clean)
  const ws: Workspace = {
    id: crypto.randomUUID(),
    name: name?.trim() || workspaceNameFromRoot(clean),
    rootDir: clean,
    profileFile,
    createdAt: Date.now()
  }

  const isFirst = workspaces.length === 0
  useWorkspaceStore.setState((s) => ({
    workspaces: [...s.workspaces, ws],
    // Invariant: active is null ⟺ zero workspaces. The first workspace
    // becomes active immediately.
    activeWorkspaceId: isFirst ? ws.id : s.activeWorkspaceId
  }))

  if (isFirst) {
    // Leaving no-workspace mode: adopt everything that exists into the new
    // workspace so nothing is stranded as "visible everywhere" noise.
    stampUnowned(ws.id)
  }

  await persistWorkspaceState()
  await refreshWorkspacePins(ws)
  return ws
}

/** Stamp every unowned session/group/pin with the given workspace. Used when
 *  the FIRST workspace is created (no-workspace mode ends). */
function stampUnowned(workspaceId: string): void {
  const sessionState = useSessionStore.getState()
  useSessionStore.setState({
    sessions: sessionState.sessions.map((s) => (s.workspaceId == null ? { ...s, workspaceId } : s)),
    groups: sessionState.groups.map((g) => (g.workspaceId == null ? { ...g, workspaceId } : g))
  })
  for (const s of sessionState.sessions) {
    if (s.workspaceId == null && s.sessionType === 'local') {
      void window.electronAPI?.setSessionWorkspace(s.id, workspaceId)
    }
  }
  usePinnedStore.setState((s) => ({
    pinnedGroups: s.pinnedGroups.map((pg) => (pg.workspaceId == null ? { ...pg, workspaceId } : pg))
  }))
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  useWorkspaceStore.setState((s) => ({
    workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w))
  }))
  await persistWorkspaceState()
}

export async function setWorkspaceProfile(id: string, profileFile: string | null): Promise<void> {
  useWorkspaceStore.setState((s) => ({
    workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, profileFile } : w))
  }))
  await persistWorkspaceState()
  const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === id)
  if (ws) await refreshWorkspacePins(ws)
}

/** How a removal would cascade — surfaced by the Settings confirm dialog. */
export function describeWorkspaceRemoval(id: string): {
  sessionCount: number
  pinCount: number
  target: Workspace | null
} {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
  const remaining = workspaces.filter((w) => w.id !== id)
  const target =
    (id === activeWorkspaceId ? remaining[0] : remaining.find((w) => w.id === activeWorkspaceId)) ??
    null
  return {
    sessionCount: useSessionStore.getState().sessions.filter((s) => s.workspaceId === id).length,
    pinCount: usePinnedStore.getState().pinnedGroups.filter((pg) => pg.workspaceId === id).length,
    target
  }
}

/** Remove a workspace. Its pins die with it (recoverable from their files);
 *  its sessions and groups are reassigned ALIVE to the target workspace (the
 *  active one, or the first remaining when removing the active one, or to the
 *  unscoped world when it was the last). */
export async function removeWorkspace(id: string): Promise<void> {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
  if (!workspaces.some((w) => w.id === id)) return
  const { target } = describeWorkspaceRemoval(id)
  const targetId = target?.id ?? null

  // Cascade pins first (removePinnedGroup handles per-file unwatching).
  const pinned = usePinnedStore.getState()
  for (const pg of pinned.pinnedGroups.filter((p) => p.workspaceId === id)) {
    pinned.removePinnedGroup(pg.id)
  }

  // Reassign sessions/groups — never kill anything on registry changes.
  const sessionState = useSessionStore.getState()
  const affectedSessions = sessionState.sessions.filter((s) => s.workspaceId === id)
  useSessionStore.setState({
    sessions: sessionState.sessions.map((s) =>
      s.workspaceId === id ? { ...s, workspaceId: targetId ?? undefined } : s
    ),
    groups: sessionState.groups.map((g) =>
      g.workspaceId === id ? { ...g, workspaceId: targetId ?? undefined } : g
    )
  })
  for (const s of affectedSessions) {
    if (s.sessionType === 'local') {
      void window.electronAPI?.setSessionWorkspace(s.id, targetId)
    }
  }

  const wasActive = id === activeWorkspaceId
  useWorkspaceStore.setState((s) => ({
    workspaces: s.workspaces.filter((w) => w.id !== id),
    activeWorkspaceId: wasActive ? targetId : s.activeWorkspaceId
  }))
  await persistWorkspaceState()
  if (wasActive) {
    useSessionStore.getState().applyWorkspaceSwitch(id, targetId)
  }
}
