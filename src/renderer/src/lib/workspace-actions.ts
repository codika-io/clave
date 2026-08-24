import type { WindowIdentity, Workspace } from '../../../shared/workspace-types'
import { useWorkspaceStore, hostsWorkspace } from '../store/workspace-store'
import {
  usePinnedStore,
  hydratePinnedGroups,
  serializePinnedGroups,
  refreshWorkspacePins,
  type PinnedGroup,
  type PinnedGroupBlueprint
} from '../store/pinned-store'
import {
  useSessionStore,
  markLayoutKeysTaken,
  dropLayoutKeys,
  isLayoutKeyTaken
} from '../store/session-store'

/** Orchestration layer above the stores. The stores stay import-acyclic
 *  (session→workspace, pinned→workspace); everything that has to touch several
 *  of them — activation side effects, add/remove cascades, persistence — lives
 *  here. UI and MCP call these, never store internals.
 *
 *  Multi-window (PRDCT-1703): this window's workspace is a per-window value
 *  main hands over at boot (`window:identity`), and every switch ASKS MAIN
 *  FIRST — the guard that keeps one workspace in one window lives there. The
 *  state file is written field by field (registry, pins, last-active), and
 *  only for the workspaces this window hosts; what other windows change
 *  arrives as `workspace:state-changed` and is folded in below. */

// ── Persistence ──────────────────────────────────────────────────────────────
// Same latch pattern as enableSidebarPersistence: hydration must never be able
// to clobber the state file before it has been read.

let persistEnabled = false
/** Per pins partition, the JSON last handed to main — re-sent only on change. */
const lastPersistedPins = new Map<string | null, string>()

function pinPartition(pin: { workspaceId?: string | null }): string | null {
  return pin.workspaceId ?? null
}

/** Write the pins of every workspace this window HOSTS whose partition
 *  changed (the hosting rule; main refuses the rest loudly). */
function persistPins(): void {
  const groups = usePinnedStore.getState().pinnedGroups
  const { hostedWorkspaceIds, isPrimary } = useWorkspaceStore.getState()
  const keys = new Set<string | null>(hostedWorkspaceIds)
  if (isPrimary) keys.add(null)
  for (const pg of groups) keys.add(pinPartition(pg))
  for (const key of keys) {
    if (!hostsWorkspace(key)) continue
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
/** Claims in flight: a `window:workspace-changed` push that lands while this
 *  window is itself switching must not run the view switch a second time. */
let claimsInFlight = 0
/** Resolved once the boot effect has restored its layouts — a key gained
 *  before that must wait, or the boot restore would replace what it merged. */
let bootLayoutsDone: () => void = () => {}
const bootLayoutsReady = new Promise<void>((resolve) => {
  bootLayoutsDone = resolve
})
/** Runtime layout takes, serialized: two identity pushes in a row (a window
 *  closing, then another) must merge in order. */
let layoutTakeQueue: Promise<void> = Promise.resolve()

export function markBootLayoutsDone(): void {
  bootLayoutsDone()
}

/**
 * Take over the layouts of workspaces this window just started hosting: read
 * their files and merge them into the store BEFORE anything could be written
 * for them. Pruning uses every session that still exists for those
 * workspaces — in this store, live in another window, or on disk as a record
 * — so a group whose members live elsewhere (or wait for the next boot) is
 * kept as a shell rather than dropped and written back as gone.
 */
export function takeLayouts(keys: (string | null)[]): Promise<void> {
  layoutTakeQueue = layoutTakeQueue.then(async () => {
    await bootLayoutsReady
    if (keys.length === 0) return
    const persisted = (await window.electronAPI?.sidebarLayoutLoad?.(keys).catch(() => null)) ?? {
      groups: [],
      displayOrder: []
    }
    const { activeWorkspaceId } = useWorkspaceStore.getState()
    const surviving = new Set<string>()
    for (const s of useSessionStore.getState().sessions) {
      if (keys.includes(s.workspaceId ?? activeWorkspaceId)) surviving.add(s.id)
    }
    const ids = keys.filter((k): k is string => typeof k === 'string')
    for (const id of ids) {
      const records = (await window.electronAPI?.listSessionRecords?.(id).catch(() => [])) ?? []
      for (const r of records) surviving.add(r.id)
    }
    const elsewhere = (await window.electronAPI?.liveSessionsElsewhere?.(ids).catch(() => [])) ?? []
    for (const id of elsewhere) surviving.add(id)
    useSessionStore
      .getState()
      .mergeLayoutForKeys(keys, persisted as { groups: never[]; displayOrder: string[] }, [
        ...surviving
      ])
    markLayoutKeysTaken(keys)
  })
  return layoutTakeQueue
}

function applyIdentity(identity: WindowIdentity): void {
  const prev = useWorkspaceStore.getState()
  const before = new Set(prev.hostedWorkspaceIds)
  const after = new Set(identity.hostedWorkspaceIds)
  const gained = identity.hostedWorkspaceIds.filter((k) => !before.has(k))
  const lost = prev.hostedWorkspaceIds.filter((k) => !after.has(k))
  useWorkspaceStore.setState({
    windowId: identity.windowId,
    isPrimary: identity.isPrimary,
    hostedWorkspaceIds: identity.hostedWorkspaceIds
  })
  // The unscoped (null) partition follows the primary role.
  if (identity.isPrimary && !prev.isPrimary) gained.push(null as unknown as string)
  if (!identity.isPrimary && prev.isPrimary) lost.push(null as unknown as string)
  if (lost.length) {
    dropLayoutKeys(lost as (string | null)[])
    for (const k of lost) lastPersistedPins.delete(k as string | null)
  }
  const toTake = (gained as (string | null)[]).filter((k) => !isLayoutKeyTaken(k))
  if (toTake.length) void takeLayouts(toTake)
  // Main is the authority on which workspace this window shows. A change it
  // made on its own (a later slice's picker or tool) is applied here; a
  // change this window asked for is applied by the claim that asked.
  if (claimsInFlight === 0 && identity.workspaceId !== prev.activeWorkspaceId && prev.loaded) {
    useWorkspaceStore.setState({ activeWorkspaceId: identity.workspaceId })
    useSessionStore.getState().applyWorkspaceSwitch(prev.activeWorkspaceId, identity.workspaceId)
  }
}

/** Fold a change another window made. The registry is taken whole; of the
 *  pins only the partitions this window does NOT host are replaced (the
 *  hosted ones are this window's own truth), keeping the runtime state of a
 *  pin already known here. Groups and sessions are never touched. */
function foldExternalState(state: { workspaces: Workspace[]; pins: unknown[] }): void {
  useWorkspaceStore.setState({ workspaces: state.workspaces })
  const blueprints = state.pins as PinnedGroupBlueprint[]
  usePinnedStore.setState((s) => {
    const mine = s.pinnedGroups.filter((pg) => hostsWorkspace(pg.workspaceId))
    const known = new Map(s.pinnedGroups.map((pg) => [pg.id, pg]))
    const foreign: PinnedGroup[] = blueprints
      .filter((bp) => typeof bp === 'object' && bp !== null && typeof bp.id === 'string')
      .filter((bp) => !hostsWorkspace(bp.workspaceId))
      .map((bp) => {
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
    return { pinnedGroups: [...mine, ...foreign] }
  })
  // The workspace this window shows was removed from another window: land on
  // the first remaining one this window may show, else the unscoped state.
  const { activeWorkspaceId, workspaces } = useWorkspaceStore.getState()
  if (activeWorkspaceId && !workspaces.some((w) => w.id === activeWorkspaceId)) {
    void (async () => {
      const landed = await claimFirstAvailable([...workspaces.map((w) => w.id), null])
      useSessionStore.getState().applyWorkspaceSwitch(activeWorkspaceId, landed)
    })()
  }
}

function subscribeToMain(): void {
  if (subscribed) return
  subscribed = true
  window.electronAPI?.onWindowWorkspaceChanged?.((identity) => applyIdentity(identity))
  window.electronAPI?.onWorkspaceStateChanged?.((state) => foldExternalState(state))
}

/** Make this window SHOW `id` (null = unscoped): main is asked first and may
 *  refuse — the workspace is already shown in another window, which main
 *  then brings forward — in which case nothing changes here. On success the
 *  store follows and the workspace becomes the last-active one (what the
 *  first window of the next run opens on). Does NOT run the view switch;
 *  callers that need it call applyWorkspaceSwitch themselves. */
async function claimWorkspace(
  id: string | null,
  options: { focus?: boolean } = {}
): Promise<boolean> {
  claimsInFlight++
  try {
    const res = (await window.electronAPI?.windowSetWorkspace?.(id, options)) ?? {
      ok: true as const
    }
    if (!res.ok) return false
    useWorkspaceStore.setState({ activeWorkspaceId: id })
    void window.electronAPI?.workspaceSetLastActive?.(id)
    return true
  } finally {
    claimsInFlight--
  }
}

/** Claim the first candidate main accepts, PROBING (no window is brought
 *  forward on a refusal — this is a fallback landing, not a user's open).
 *  `null` (unscoped) always succeeds. */
async function claimFirstAvailable(candidates: (string | null)[]): Promise<string | null> {
  for (const id of candidates) {
    if (await claimWorkspace(id, { focus: false })) return id
  }
  return useWorkspaceStore.getState().activeWorkspaceId
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
    isPrimary: identity?.isPrimary ?? true,
    hostedWorkspaceIds: identity?.hostedWorkspaceIds ?? workspaces.map((w) => w.id)
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

/** Pure view switch. Main is asked BEFORE anything changes here, so its
 *  registry is current when the next pty:spawn stamps its record (IPC is
 *  FIFO) — and so a workspace another window shows is never switched to:
 *  that window comes forward and this one keeps its view. */
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
    // workspace's content — there is nothing on disk to "take", so do the
    // whole transition IN-STORE first, BEFORE main broadcasts the registry
    // change: mark the workspace taken (so the gained-workspace identity push
    // does not re-read its empty file and drop everything — the F1 race),
    // make it active, and stamp every unscoped session/group/pin into it.
    // Invariant: active is null ⟺ zero workspaces. No other window can be
    // showing a workspace that did not exist a moment ago, so the optimistic
    // active is safe and the claim below cannot be refused.
    markLayoutKeysTaken([ws.id])
    // The sole window now shows and hosts the new workspace; set both
    // optimistically so the persist that stampUnowned triggers actually writes
    // its file (the async identity push that would set hostedWorkspaceIds has
    // not arrived yet). Main confirms hosting on the broadcast below.
    useWorkspaceStore.setState({ activeWorkspaceId: ws.id, hostedWorkspaceIds: [ws.id] })
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
    // The preferred target may be shown in another window (main refuses it);
    // land on the first remaining workspace this window may show, else the
    // unscoped state.
    const remaining = useWorkspaceStore.getState().workspaces.map((w) => w.id)
    const landed = await claimFirstAvailable([
      ...(targetId ? [targetId] : []),
      ...remaining.filter((w) => w !== targetId),
      null
    ])
    useSessionStore.getState().applyWorkspaceSwitch(id, landed)
  }
}
