/**
 * The pure sidebar-layout merges (PRDCT-1703), kept pure so vitest pins
 * them: how this window's layout read from its own file is merged into the
 * store at boot (`mergeLayoutForKeys`), and how groups handed over by
 * another window — a closing window's sidebar, a group moved here — are
 * taken in (`absorbLayout`).
 */
export interface LayoutGroupLike {
  id: string
  sessionIds: string[]
  terminals: { sessionId: string | null }[]
  workspaceId?: string
}

export interface LayoutSessionLike {
  id: string
  workspaceId?: string
  view?: { serverSessionId?: string | null } | null
}

export interface LayoutSlice<G extends LayoutGroupLike> {
  groups: G[]
  displayOrder: string[]
}

export type LayoutKey = string | null

/**
 * Replace the partitions of `keys` in the store with `persisted` (those
 * workspaces' layouts as read from their files), pruned to `surviving`
 * sessions, and leave every other workspace's groups and order untouched.
 *
 * `surviving` is every session that still EXISTS for those workspaces — in
 * this store, live in another window, or a record on disk — not merely the
 * ones this window holds: a group whose members live elsewhere is kept as a
 * shell (its rows render nothing here), because pruning it would rewrite the
 * file without it the moment this window persists. Only a session that is
 * gone everywhere prunes its group, exactly as boot restore does.
 *
 * The same shape the boot restore uses: a group with no
 * surviving member is dropped, a terminal whose session is gone is detached,
 * the persisted order is kept minus dead references, surviving standalone
 * sessions of those workspaces the order missed are appended, then kept
 * groups not yet placed. Ids nested inside a kept group (a member, a group
 * terminal, a session view's hidden server) never surface at the top level.
 */
export function mergeLayoutForKeys<G extends LayoutGroupLike>(
  state: { groups: G[]; displayOrder: string[]; sessions: LayoutSessionLike[] },
  keys: LayoutKey[],
  persisted: LayoutSlice<G>,
  surviving: Iterable<string>
): { groups: G[]; displayOrder: string[] } {
  const keySet = new Set<LayoutKey>(keys)
  const alive = new Set(surviving)
  // Ownership is by EXPLICIT stamp; an unstamped item belongs to the unscoped
  // (null) partition only, never to a string workspace being taken. This is
  // the asymmetry with the WRITE path (partitionSidebarLayout routes an
  // unstamped group to the window's workspace): a TAKE must never claim — and
  // then drop from an empty file — an unstamped group that has not been
  // stamped yet. Taking one workspace's layout leaves unstamped groups (and
  // every other workspace's) exactly where they are; only when the NULL key
  // itself is merged (no-workspace mode boot) does an unstamped group belong
  // to it. (Regression guard for the first-workspace F1: registering the
  // first workspace no longer routes the still-unstamped groups through the
  // empty new file.)
  const ownsGroup = (g: G): boolean => keySet.has(g.workspaceId ?? null)
  const sessionKey = new Map<string, LayoutKey>()
  for (const s of state.sessions) sessionKey.set(s.id, s.workspaceId ?? null)

  // Everything of OTHER workspaces stays exactly where it is.
  const others = state.groups.filter((g) => !ownsGroup(g))
  const otherGroupIds = new Set(others.map((g) => g.id))

  const kept: G[] = []
  for (const g of persisted.groups ?? []) {
    const sessionIds = (g.sessionIds ?? []).filter((sid) => alive.has(sid))
    if (sessionIds.length === 0) continue
    const terminals = (g.terminals ?? []).map((t) =>
      t.sessionId && !alive.has(t.sessionId) ? { ...t, sessionId: null } : t
    )
    kept.push({ ...g, sessionIds, terminals })
  }
  const keptIds = new Set(kept.map((g) => g.id))

  const nested = new Set<string>()
  for (const g of kept) {
    for (const sid of g.sessionIds) nested.add(sid)
    for (const t of g.terminals) if (t.sessionId) nested.add(t.sessionId)
  }
  for (const s of state.sessions) {
    if (s.view?.serverSessionId) nested.add(s.view.serverSessionId)
  }

  const order: string[] = []
  const seen = new Set<string>()
  const push = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    order.push(id)
  }
  // Other workspaces' entries keep their positions; this window's entries of
  // the merged keys are rebuilt below. An id that names nothing known is
  // stale and dropped.
  for (const id of state.displayOrder) {
    if (otherGroupIds.has(id)) push(id)
    else if (sessionKey.has(id) && !keySet.has(sessionKey.get(id)!)) push(id)
    else if (!sessionKey.has(id) && !keySet.size) push(id)
  }
  for (const id of persisted.displayOrder ?? []) {
    if (keptIds.has(id)) push(id)
    else if (alive.has(id) && !nested.has(id)) push(id)
  }
  for (const s of state.sessions) {
    if (keySet.has(sessionKey.get(s.id)!) && !nested.has(s.id)) push(s.id)
  }
  for (const g of kept) push(g.id)

  return { groups: [...others, ...kept], displayOrder: order }
}

/**
 * Append what another window handed over: groups not already in the store
 * (by id) and top-level order entries not already placed, in the incoming
 * order. Known groups and entries are left exactly where they are, and an id
 * nested inside a kept group never surfaces at the top level. The members
 * themselves arrive through adoption (addSession), which places a session
 * whose group already holds it.
 */
export function absorbLayout<G extends LayoutGroupLike>(
  state: { groups: G[]; displayOrder: string[] },
  incoming: { groups?: G[]; displayOrder?: string[] }
): { groups: G[]; displayOrder: string[] } {
  const known = new Set(state.groups.map((g) => g.id))
  const groups = [...state.groups]
  for (const g of incoming.groups ?? []) {
    if (!g || typeof g.id !== 'string' || known.has(g.id)) continue
    known.add(g.id)
    groups.push({
      ...g,
      sessionIds: Array.isArray(g.sessionIds) ? g.sessionIds : [],
      terminals: Array.isArray(g.terminals) ? g.terminals : []
    })
  }
  const nested = new Set<string>()
  for (const g of groups) {
    for (const sid of g.sessionIds) nested.add(sid)
    for (const t of g.terminals) if (t.sessionId) nested.add(t.sessionId)
  }
  const placed = new Set(state.displayOrder)
  const displayOrder = [...state.displayOrder]
  for (const id of incoming.displayOrder ?? []) {
    if (typeof id !== 'string' || placed.has(id) || nested.has(id)) continue
    placed.add(id)
    displayOrder.push(id)
  }
  return { groups, displayOrder }
}

/**
 * Where an ADOPTED session goes in the sidebar — a survivor at boot, a tab
 * handed over by another window. Placement-neutral by design: an adoption
 * never nests a tab into a group it was not in (the fresh-spawn heuristic
 * that nests into the selected group must not apply — a moved tab would be
 * swallowed by whatever the target window has selected) and never puts it
 * at the top level when something already holds it (a group's members, a
 * group's quick-launch terminal, a session view's hidden server) — that
 * would show one tab twice. Returns the new top-level order.
 */
export function placeAdopted<G extends LayoutGroupLike>(
  state: { groups: G[]; displayOrder: string[]; sessions: LayoutSessionLike[] },
  sessionId: string
): string[] {
  if (state.displayOrder.includes(sessionId)) return state.displayOrder
  for (const g of state.groups) {
    if (g.sessionIds.includes(sessionId)) return state.displayOrder
    if (g.terminals.some((t) => t.sessionId === sessionId)) return state.displayOrder
  }
  if (state.sessions.some((s) => s.view?.serverSessionId === sessionId)) return state.displayOrder
  return [...state.displayOrder, sessionId]
}
