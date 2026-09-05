import type { WindowIdentity, Workspace } from '../../../shared/workspace-types'
import { useWorkspaceStore } from '../store/workspace-store'
import {
  usePinnedStore,
  hydratePinnedGroups,
  serializePinnedGroups,
  dedupePinsById,
  refreshWorkspacePins,
  type PinnedGroup,
  type PinnedGroupBlueprint
} from '../store/pinned-store'
import { useSessionStore } from '../store/session-store'

/** Orchestration layer above the stores. The stores stay import-acyclic
 *  (session→workspace, pinned→workspace); everything that has to touch several
 *  of them — activation side effects, add/remove cascades, persistence — lives
 *  here. UI and MCP call these, never store internals.
 *
 *  Multi-window (PRDCT-1703): a window is the whole app once more. This
 *  window's workspace is a per-window value main hands over at boot
 *  (`window:identity`), and every switch TELLS MAIN FIRST so the next spawn
 *  is stamped against it. The state file is written field by field
 *  (registry, pins, last-active) by whichever window changed a field; what
 *  other windows change arrives as `workspace:state-changed` and is folded
 *  in below. */

// ── Persistence ──────────────────────────────────────────────────────────────
// Same latch pattern as enableSidebarPersistence: hydration must never be able
// to clobber the state file before it has been read.

let persistEnabled = false
/** Per pins partition, the JSON last handed to main — re-sent only on change. */
const lastPersistedPins = new Map<string | null, string>()

function pinPartition(pin: { workspaceId?: string | null }): string | null {
  return pin.workspaceId ?? null
}

/** Write every pins partition that changed since it was last written (or
 *  folded in from another window). Pins are per workspace and global to the
 *  app; every window holds the same list. */
function persistPins(): void {
  const groups = usePinnedStore.getState().pinnedGroups
  const keys = new Set<string | null>()
  for (const pg of groups) keys.add(pinPartition(pg))
  for (const key of lastPersistedPins.keys()) keys.add(key)
  for (const key of keys) {
    const partition = serializePinnedGroups(groups.filter((pg) => pinPartition(pg) === key))
    const json = JSON.stringify(partition)
    if (lastPersistedPins.get(key) === json) continue
    void window.electronAPI?.workspaceUpdatePins?.(key, partition).then((res) => {
      if (res?.ok) lastPersistedPins.set(key, json)
    })
  }
}

/** The registry is global: any window may rewrite the list of workspaces. */
export function persistWorkspaceRegistry(): Promise<unknown> {
  const { workspaces } = useWorkspaceStore.getState()
  return window.electronAPI?.workspaceUpdateRegistry?.(workspaces) ?? Promise.resolve()
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
    persistPins()
  })
}

// ── Identity and the other windows ───────────────────────────────────────────

let subscribed = false

function applyIdentity(identity: WindowIdentity): void {
  useWorkspaceStore.setState({
    windowId: identity.windowId,
    windowKey: identity.windowKey,
    isPrimary: identity.isPrimary
  })
}

/** Record `blueprints` as what the state file holds, partition by partition,
 *  so the next persist rewrites exactly the partitions that changed — and
 *  rewrites a partition a pin LEFT as empty. Without the seed a pin re-stamped
 *  from null to a workspace id is written into its new partition while the
 *  null partition, never having been "persisted" by this window, is not
 *  touched: the stale copy survives in the file and hydrates beside the
 *  re-stamped one at the next boot. */
function seedPersistedPins(blueprints: PinnedGroupBlueprint[]): void {
  const byKey = new Map<string | null, PinnedGroupBlueprint[]>()
  for (const bp of blueprints) {
    const key = pinPartition(bp)
    byKey.set(key, [...(byKey.get(key) ?? []), bp])
  }
  lastPersistedPins.clear()
  for (const [key, list] of byKey) {
    lastPersistedPins.set(key, JSON.stringify(serializePinnedGroups(list as PinnedGroup[])))
  }
}

/** Fold a change another window made. The registry is taken whole; the pin
 *  blueprints are replaced from the file, keeping the runtime state (the
 *  launched group, visibility) of every pin already known here. The folded
 *  partitions count as persisted, so the fold does not echo a write back.
 *  Groups and sessions are never touched. */
function foldExternalState(state: { workspaces: Workspace[]; pins: unknown[] }): void {
  useWorkspaceStore.setState({ workspaces: state.workspaces })
  const blueprints = dedupePinsById(
    (state.pins as PinnedGroupBlueprint[]).filter(
      (bp) => typeof bp === 'object' && bp !== null && typeof bp.id === 'string'
    )
  )
  usePinnedStore.setState((s) => {
    const known = new Map(s.pinnedGroups.map((pg) => [pg.id, pg]))
    const next: PinnedGroup[] = blueprints.map((bp) => {
      const prev = known.get(bp.id)
      return {
        ...bp,
        sessions: (Array.isArray(bp.sessions) ? bp.sessions : []).map((sess) => ({
          ...sess,
          antigravityMode:
            sess.antigravityMode ?? (sess as { geminiMode?: boolean }).geminiMode ?? false
        })),
        activeGroupId: prev?.activeGroupId ?? null,
        visible: prev?.visible ?? false
      }
    })
    return { pinnedGroups: next }
  })
  seedPersistedPins(blueprints)
  // The workspace this window shows was removed from another window: land on
  // the first remaining one, else the unscoped state.
  const { activeWorkspaceId, workspaces } = useWorkspaceStore.getState()
  if (activeWorkspaceId && !workspaces.some((w) => w.id === activeWorkspaceId)) {
    const landed = workspaces[0]?.id ?? null
    void claimWorkspace(landed)
    useSessionStore.getState().applyWorkspaceSwitch(activeWorkspaceId, landed)
  }
}

function subscribeToMain(): void {
  if (subscribed) return
  subscribed = true
  window.electronAPI?.onWindowIdentityChanged?.((identity) => applyIdentity(identity))
  window.electronAPI?.onWorkspaceStateChanged?.((state) => foldExternalState(state))
}

/** Make this window SHOW `id` (null = unscoped): main is told first — so its
 *  registry is current when the next pty:spawn stamps its record (IPC is
 *  FIFO) and the window comes back on this workspace at the next boot — then
 *  the store follows. Only an unknown workspace is refused. Does NOT run the
 *  view switch; callers that need it call applyWorkspaceSwitch themselves. */
async function claimWorkspace(id: string | null): Promise<boolean> {
  const res = (await window.electronAPI?.windowSetWorkspace?.(id)) ?? { ok: true as const }
  if (!res.ok) return false
  useWorkspaceStore.setState({ activeWorkspaceId: id })
  return true
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
 *  before session adoption so adoption can stamp against the registry).
 *  This window's workspace comes from main's registry (`window:identity`),
 *  never from the state file; outside Electron there is no identity and the
 *  renderer behaves as the sole, primary window on the last-active one. */
export async function bootWorkspaces(): Promise<void> {
  const identity = (await window.electronAPI?.windowIdentity?.().catch(() => null)) ?? null
  const state = await window.electronAPI?.workspaceLoad?.().catch(() => null)
  const workspaces = state?.workspaces ?? []
  const activeWorkspaceId = identity
    ? identity.workspaceId
    : (state?.lastActiveWorkspaceId ?? state?.activeWorkspaceId ?? null)

  useWorkspaceStore.setState({
    workspaces,
    activeWorkspaceId,
    loaded: true,
    windowId: identity?.windowId ?? null,
    windowKey: identity?.windowKey ?? null,
    isPrimary: identity?.isPrimary ?? true
  })
  subscribeToMain()

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
  // What the file holds is what this window has "persisted": the boot refresh
  // that follows re-stamps and prunes against it, and a partition that empties
  // must be written back empty.
  seedPersistedPins(serializePinnedGroups(usePinnedStore.getState().pinnedGroups))
  enableWorkspacePersistence()

  if (state && !state.pinsMigrated) {
    // Persist the migrated pins — the whole list at once, this being the sole
    // window of the very first boot of the workspace model (flips
    // pinsMigrated true) — then retire the localStorage key for good.
    await window.electronAPI?.workspaceUpdatePins?.(
      'all',
      serializePinnedGroups(usePinnedStore.getState().pinnedGroups)
    )
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

/** Pure view switch for THIS window. Main is told BEFORE anything changes
 *  here, so its registry is current when the next pty:spawn stamps its
 *  record (IPC is FIFO); other windows are untouched. */
export async function setActiveWorkspace(id: string): Promise<void> {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
  if (id === activeWorkspaceId) return
  const target = workspaces.find((w) => w.id === id)
  if (!target) return

  if (!(await claimWorkspace(id))) return
  useSessionStore.getState().applyWorkspaceSwitch(activeWorkspaceId, id)
  // NOTE (§3.6 third bullet, deferred): an IN-WINDOW switch does not re-home
  // sessions in this slice. Re-homing on switch means the window both GAINS
  // one workspace's sessions and RELEASES another's to the primary while both
  // windows' layouts re-home too — the same load-bearing ordering as the
  // first-workspace transition, and no numbered invariant (§6) requires it
  // (invariant 11 is the NEW-window case, invariant 3 the window-close case,
  // both re-homed here). A secondary window switching workspaces keeps its
  // previous workspace's sessions hidden-hosted in it — fully reachable
  // (clave_send_to_session, clave_list) — rather than moving them. The
  // heavy path is left for a follow-up so its risk does not ride into this
  // slice untested. `setActiveWorkspace` is the only switch entry (the UI and
  // clave_switch_workspace both call it), so this note governs both.
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
  useWorkspaceStore.setState((s) => ({ workspaces: [...s.workspaces, ws] }))

  if (isFirst) {
    // Leaving no-workspace mode. The current unscoped sidebar IS this
    // workspace's content: make it active and stamp every unscoped
    // session/group/pin into it, in-store, before main learns the registry
    // change. Invariant: active is null ⟺ zero workspaces.
    useWorkspaceStore.setState({ activeWorkspaceId: ws.id })
    stampUnowned(ws.id)
  }

  // Main learns the workspace (and, on the first, that this window shows it).
  await persistWorkspaceRegistry()
  if (isFirst) await claimWorkspace(ws.id)

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
  await persistWorkspaceRegistry()
}

export async function setWorkspaceProfile(id: string, profileFile: string | null): Promise<void> {
  useWorkspaceStore.setState((s) => ({
    workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, profileFile } : w))
  }))
  await persistWorkspaceRegistry()
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
  useWorkspaceStore.setState((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) }))
  await persistWorkspaceRegistry()
  if (wasActive) {
    // Land on the preferred target, else the first remaining workspace, else
    // the unscoped state. (Another window showing the removed workspace
    // lands the same way when the registry change reaches it.)
    const remaining = useWorkspaceStore.getState().workspaces.map((w) => w.id)
    const landed = targetId ?? remaining[0] ?? null
    await claimWorkspace(landed)
    useSessionStore.getState().applyWorkspaceSwitch(id, landed)
  }
}
