/**
 * The renderer's half of per-workspace sidebar layouts (PRDCT-1703), kept
 * pure so vitest pins it: how the one in-memory sidebar is split into one
 * layout per workspace for writing, and how a workspace's layout read from
 * its file is merged back into the store when a window starts hosting it.
 *
 * The rule both directions share: an item belongs to the workspace it is
 * stamped with; unstamped items belong to `fallback` — this window's
 * workspace, or null in no-workspace mode (the unscoped layout).
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

/** Split the sidebar into one layout per workspace. A group goes by its own
 *  stamp; a display-order id goes by the group or session it names; anything
 *  unstamped or unknown (file tabs, stale ids) goes to `fallback`. */
export function partitionSidebarLayout<G extends LayoutGroupLike>(
  groups: G[],
  displayOrder: string[],
  sessions: LayoutSessionLike[],
  fallback: LayoutKey
): Map<LayoutKey, LayoutSlice<G>> {
  const out = new Map<LayoutKey, LayoutSlice<G>>()
  const bucket = (key: LayoutKey): LayoutSlice<G> => {
    let b = out.get(key)
    if (!b) {
      b = { groups: [], displayOrder: [] }
      out.set(key, b)
    }
    return b
  }
  const groupKey = new Map<string, LayoutKey>()
  for (const g of groups) {
    const key = g.workspaceId ?? fallback
    groupKey.set(g.id, key)
    bucket(key).groups.push(g)
  }
  const sessionKey = new Map<string, LayoutKey>()
  for (const s of sessions) sessionKey.set(s.id, s.workspaceId ?? fallback)
  for (const id of displayOrder) {
    const key = groupKey.has(id) ? groupKey.get(id)! : (sessionKey.get(id) ?? fallback)
    bucket(key).displayOrder.push(id)
  }
  return out
}

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
 * The same shape as the boot-time restore (`restoreGroups`): a group with no
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
  surviving: Iterable<string>,
  fallback: LayoutKey
): { groups: G[]; displayOrder: string[] } {
  const keySet = new Set<LayoutKey>(keys)
  const alive = new Set(surviving)
  const ownsGroup = (g: G): boolean => keySet.has(g.workspaceId ?? fallback)
  const sessionKey = new Map<string, LayoutKey>()
  for (const s of state.sessions) sessionKey.set(s.id, s.workspaceId ?? fallback)

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
