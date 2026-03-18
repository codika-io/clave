import { create } from 'zustand'
import type { PinnedGroup, PinnedGroupSession, PinnedGroupTerminal, GroupTerminalColor } from './session-types'
import { useSessionStore } from './session-store'

export type { PinnedGroup }

type PinnedState = 'idle' | 'active-visible' | 'active-hidden'

export function getPinnedState(pg: PinnedGroup): PinnedState {
  if (!pg.activeGroupId) return 'idle'
  return pg.visible ? 'active-visible' : 'active-hidden'
}

interface PinnedGroupBlueprint {
  id: string
  name: string
  cwd: string | null
  color: GroupTerminalColor | null
  sessions: PinnedGroupSession[]
  terminals: PinnedGroupTerminal[]
  createdAt: number
}

function loadPersistedGroups(): PinnedGroup[] {
  try {
    const raw = localStorage.getItem('clave-pinned-groups')
    if (!raw) return []
    const blueprints: PinnedGroupBlueprint[] = JSON.parse(raw)
    return blueprints.map((bp) => ({
      ...bp,
      activeGroupId: null,
      visible: false
    }))
  } catch {
    return []
  }
}

function persistGroups(groups: PinnedGroup[]): void {
  const blueprints: PinnedGroupBlueprint[] = groups.map(({ id, name, cwd, color, sessions, terminals, createdAt }) => ({
    id, name, cwd, color, sessions, terminals, createdAt
  }))
  localStorage.setItem('clave-pinned-groups', JSON.stringify(blueprints))
}

interface PinnedStoreState {
  pinnedGroups: PinnedGroup[]
  pinnedCollapsed: boolean
  addPinnedGroup: (pg: PinnedGroup) => void
  removePinnedGroup: (id: string) => void
  renamePinnedGroup: (id: string, name: string) => void
  togglePinnedCollapsed: () => void
  setActiveGroupId: (pinnedId: string, groupId: string | null) => void
  setVisible: (pinnedId: string, visible: boolean) => void
}

export const usePinnedStore = create<PinnedStoreState>((set) => ({
  pinnedGroups: loadPersistedGroups(),
  pinnedCollapsed: localStorage.getItem('clave-pinned-collapsed') === 'true',

  addPinnedGroup: (pg) =>
    set((s) => {
      const next = [...s.pinnedGroups, pg]
      persistGroups(next)
      return { pinnedGroups: next }
    }),

  removePinnedGroup: (id) =>
    set((s) => {
      const next = s.pinnedGroups.filter((pg) => pg.id !== id)
      persistGroups(next)
      return { pinnedGroups: next }
    }),

  renamePinnedGroup: (id, name) =>
    set((s) => {
      const next = s.pinnedGroups.map((pg) => (pg.id === id ? { ...pg, name } : pg))
      persistGroups(next)
      return { pinnedGroups: next }
    }),

  togglePinnedCollapsed: () =>
    set((s) => {
      const next = !s.pinnedCollapsed
      localStorage.setItem('clave-pinned-collapsed', String(next))
      return { pinnedCollapsed: next }
    }),

  setActiveGroupId: (pinnedId, groupId) =>
    set((s) => ({
      pinnedGroups: s.pinnedGroups.map((pg) =>
        pg.id === pinnedId ? { ...pg, activeGroupId: groupId } : pg
      )
    })),

  setVisible: (pinnedId, visible) =>
    set((s) => ({
      pinnedGroups: s.pinnedGroups.map((pg) =>
        pg.id === pinnedId ? { ...pg, visible } : pg
      )
    }))
}))

/** Capture a live group as a pinned blueprint */
export function pinGroupFromCurrent(groupId: string): void {
  const { groups, sessions } = useSessionStore.getState()
  const group = groups.find((g) => g.id === groupId)
  if (!group) return

  // Exclude sessions that are linked to a group terminal — those are restored via terminal configs
  const terminalSessionIds = new Set(
    group.terminals.map((t) => t.sessionId).filter((id): id is string => id !== null)
  )

  const groupSessions: PinnedGroupSession[] = group.sessionIds
    .filter((sid) => !terminalSessionIds.has(sid))
    .map((sid) => sessions.find((s) => s.id === sid))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => ({
      cwd: s.cwd,
      name: s.name,
      claudeMode: s.claudeMode,
      dangerousMode: s.dangerousMode
    }))

  const groupTerminals: PinnedGroupTerminal[] = group.terminals.map((t) => ({
    command: t.command,
    commandMode: t.commandMode,
    color: t.color
  }))

  const pinned: PinnedGroup = {
    id: crypto.randomUUID(),
    name: group.name,
    cwd: group.cwd,
    color: group.color ?? null,
    sessions: groupSessions,
    terminals: groupTerminals,
    createdAt: Date.now(),
    // Link to the live group immediately — clicking won't respawn
    activeGroupId: groupId,
    visible: true
  }

  usePinnedStore.getState().addPinnedGroup(pinned)
}

/** Toggle a pinned group: idle → spawn, active+visible → hide, active+hidden → show */
export async function togglePinnedGroup(pinnedId: string): Promise<void> {
  const pg = usePinnedStore.getState().pinnedGroups.find((p) => p.id === pinnedId)
  if (!pg) return

  const state = getPinnedState(pg)

  // Active + Visible → always hide (don't check alive — user wants to toggle off)
  if (state === 'active-visible') {
    hidePinnedGroup(pinnedId)
    return
  }

  // For idle or active+hidden: validate linked group still exists
  if (pg.activeGroupId) {
    const sessionState = useSessionStore.getState()
    const linkedGroup = sessionState.groups.find((g) => g.id === pg.activeGroupId)
    if (!linkedGroup) {
      // Group was deleted externally — reset to idle and spawn fresh
      usePinnedStore.getState().setActiveGroupId(pinnedId, null)
      usePinnedStore.getState().setVisible(pinnedId, false)
      await spawnPinnedGroup(pinnedId, pg)
      return
    }

    // Active + Hidden → show the existing group
    showPinnedGroup(pinnedId, pg)
    return
  }

  // Idle → spawn fresh
  await spawnPinnedGroup(pinnedId, pg)
}

async function spawnPinnedGroup(pinnedId: string, pg: PinnedGroup): Promise<void> {
  if (!window.electronAPI?.spawnSession) return

  const spawnedIds: string[] = []

  for (const session of pg.sessions) {
    try {
      const sessionInfo = await window.electronAPI.spawnSession(session.cwd, {
        claudeMode: session.claudeMode,
        dangerousMode: session.dangerousMode
      })

      useSessionStore.getState().addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: session.name,
        alive: sessionInfo.alive,
        activityStatus: 'idle',
        promptWaiting: null,
        claudeMode: session.claudeMode,
        dangerousMode: session.dangerousMode,
        claudeSessionId: sessionInfo.claudeSessionId,
        sessionType: 'local',
        detectedUrl: null,
        hasUnseenActivity: false
      })

      if (session.name !== sessionInfo.folderName) {
        useSessionStore.getState().renameSession(sessionInfo.id, session.name)
      }

      spawnedIds.push(sessionInfo.id)
    } catch (err) {
      console.error(`[pinned] Failed to spawn session "${session.name}":`, err)
    }
  }

  if (spawnedIds.length === 0) {
    console.warn('[pinned] No sessions could be spawned')
    return
  }

  // Create group
  useSessionStore.getState().createGroup(spawnedIds, pg.name)

  const sessionState = useSessionStore.getState()
  const newGroup = sessionState.groups[sessionState.groups.length - 1]
  if (!newGroup) return

  // Patch group with saved metadata
  useSessionStore.setState((s) => ({
    groups: s.groups.map((g) =>
      g.id === newGroup.id
        ? {
            ...g,
            cwd: pg.cwd ?? g.cwd,
            color: pg.color,
            terminals: pg.terminals.map((t) => ({
              id: crypto.randomUUID(),
              command: t.command,
              commandMode: t.commandMode,
              color: t.color as GroupTerminalColor,
              sessionId: null
            }))
          }
        : g
    )
  }))

  // Link pinned group to the live group
  usePinnedStore.getState().setActiveGroupId(pinnedId, newGroup.id)
  usePinnedStore.getState().setVisible(pinnedId, true)

  // Focus the first session
  if (spawnedIds.length > 0) {
    useSessionStore.getState().setFocusedSession(spawnedIds[0])
    useSessionStore.getState().selectSession(spawnedIds[0], false)
  }
}

function hidePinnedGroup(pinnedId: string): void {
  usePinnedStore.getState().setVisible(pinnedId, false)
}

function showPinnedGroup(pinnedId: string, pg: PinnedGroup): void {
  usePinnedStore.getState().setVisible(pinnedId, true)

  // Focus the first session in the group
  if (!pg.activeGroupId) return
  const group = useSessionStore.getState().groups.find((g) => g.id === pg.activeGroupId)
  if (group && group.sessionIds.length > 0) {
    useSessionStore.getState().setFocusedSession(group.sessionIds[0])
    useSessionStore.getState().selectSession(group.sessionIds[0], false)
  }
}

/** Returns the set of group IDs that are hidden by pinned toggle (active but not visible) */
export function getHiddenGroupIds(): Set<string> {
  const ids = new Set<string>()
  for (const pg of usePinnedStore.getState().pinnedGroups) {
    if (pg.activeGroupId && !pg.visible) {
      ids.add(pg.activeGroupId)
    }
  }
  return ids
}

/** Remove a pinned group, optionally killing its active sessions */
export async function removePinnedGroupWithCleanup(pinnedId: string): Promise<void> {
  const pg = usePinnedStore.getState().pinnedGroups.find((p) => p.id === pinnedId)
  if (!pg) return

  // If active, kill sessions and remove group
  if (pg.activeGroupId) {
    const sessionState = useSessionStore.getState()
    const group = sessionState.groups.find((g) => g.id === pg.activeGroupId)
    if (group) {
      // Kill all PTYs
      await Promise.allSettled(
        group.sessionIds.map((sid) => window.electronAPI.killSession(sid).catch(() => {}))
      )
      useSessionStore.getState().deleteGroup(group.id)
    }
  }

  usePinnedStore.getState().removePinnedGroup(pinnedId)
}

/** Re-sync a pinned group's blueprint from the current live group state */
export function resyncPinnedGroup(groupId: string): void {
  const { groups, sessions } = useSessionStore.getState()
  const group = groups.find((g) => g.id === groupId)
  if (!group) return

  const pinnedGroups = usePinnedStore.getState().pinnedGroups
  const pg = pinnedGroups.find((p) => p.activeGroupId === groupId)
  if (!pg) return

  const terminalSessionIds = new Set(
    group.terminals.map((t) => t.sessionId).filter((id): id is string => id !== null)
  )

  const updatedSessions: PinnedGroupSession[] = group.sessionIds
    .filter((sid) => !terminalSessionIds.has(sid))
    .map((sid) => sessions.find((s) => s.id === sid))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => ({
      cwd: s.cwd,
      name: s.name,
      claudeMode: s.claudeMode,
      dangerousMode: s.dangerousMode
    }))

  const updatedTerminals: PinnedGroupTerminal[] = group.terminals.map((t) => ({
    command: t.command,
    commandMode: t.commandMode,
    color: t.color
  }))

  usePinnedStore.setState((s) => {
    const next = s.pinnedGroups.map((p) =>
      p.id === pg.id
        ? {
            ...p,
            name: group.name,
            cwd: group.cwd,
            color: group.color ?? null,
            sessions: updatedSessions,
            terminals: updatedTerminals
          }
        : p
    )
    persistGroups(next)
    return { pinnedGroups: next }
  })
}

/** Find the pinned group linked to a live group (if any) */
export function findPinnedByGroupId(groupId: string): PinnedGroup | undefined {
  return usePinnedStore.getState().pinnedGroups.find((p) => p.activeGroupId === groupId)
}

/** Check if a pinned group's blueprint is out of sync with the live group */
export function isPinnedOutOfSync(groupId: string): boolean {
  const pg = findPinnedByGroupId(groupId)
  if (!pg) return false

  const { groups, sessions } = useSessionStore.getState()
  const group = groups.find((g) => g.id === groupId)
  if (!group) return false

  // Compare session count (excluding terminal-linked sessions)
  const terminalSessionIds = new Set(
    group.terminals.map((t) => t.sessionId).filter((id): id is string => id !== null)
  )
  const liveSessions = group.sessionIds.filter((sid) => !terminalSessionIds.has(sid))
  if (liveSessions.length !== pg.sessions.length) return true

  // Compare session configs
  for (let i = 0; i < liveSessions.length; i++) {
    const s = sessions.find((sess) => sess.id === liveSessions[i])
    const ps = pg.sessions[i]
    if (!s || !ps) return true
    if (s.cwd !== ps.cwd || s.claudeMode !== ps.claudeMode || s.dangerousMode !== ps.dangerousMode) return true
  }

  // Compare terminal count and configs
  if (group.terminals.length !== pg.terminals.length) return true
  for (let i = 0; i < group.terminals.length; i++) {
    const t = group.terminals[i]
    const pt = pg.terminals[i]
    if (t.command !== pt.command || t.commandMode !== pt.commandMode || t.color !== pt.color) return true
  }

  return false
}

// Auto-sync group name changes to linked pinned buttons
useSessionStore.subscribe((state, prevState) => {
  if (state.groups === prevState.groups) return

  const pinnedGroups = usePinnedStore.getState().pinnedGroups
  let changed = false

  const updated = pinnedGroups.map((pg) => {
    if (!pg.activeGroupId) return pg
    const group = state.groups.find((g) => g.id === pg.activeGroupId)
    if (!group) return pg
    const newColor = group.color ?? null
    if (group.name !== pg.name || newColor !== pg.color) {
      changed = true
      return { ...pg, name: group.name, color: newColor }
    }
    return pg
  })

  if (changed) {
    usePinnedStore.setState({ pinnedGroups: updated })
    persistGroups(updated)
  }
})
