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
  filePath?: string | null
  groupIndex?: number
  toolbar?: boolean
  logo?: string | null
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
  const blueprints: PinnedGroupBlueprint[] = groups.map(({ id, name, cwd, color, sessions, terminals, createdAt, filePath, groupIndex, toolbar, logo }) => ({
    id, name, cwd, color, sessions, terminals, createdAt, filePath, groupIndex, toolbar, logo
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
  updatePinnedGroup: (pinnedId: string, updates: Partial<PinnedGroup>) => void
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
      const removed = s.pinnedGroups.find((pg) => pg.id === id)
      if (removed?.filePath) {
        window.electronAPI?.unwatchClaveFile(removed.filePath).catch(() => {})
      }
      const next = s.pinnedGroups.filter((pg) => pg.id !== id)
      persistGroups(next)
      return { pinnedGroups: next }
    }),

  renamePinnedGroup: (id, name) =>
    set((s) => {
      const next = s.pinnedGroups.map((pg) => (pg.id === id ? { ...pg, name } : pg))
      persistGroups(next)
      const renamed = next.find((pg) => pg.id === id)
      if (renamed) syncToClaveFile(renamed)
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
    })),

  updatePinnedGroup: (pinnedId, updates) =>
    set((s) => {
      const next = s.pinnedGroups.map((pg) =>
        pg.id === pinnedId ? { ...pg, ...updates } : pg
      )
      persistGroups(next)
      return { pinnedGroups: next }
    })
}))

// ── Sync to .clave file (debounced) ──

let syncTimer: ReturnType<typeof setTimeout> | null = null
const pendingSyncs = new Set<string>()

function syncToClaveFile(pg: PinnedGroup): void {
  if (!pg.filePath) return
  // Track by filePath (not pin ID) so multi-group files are written once
  pendingSyncs.add(pg.filePath)

  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    const store = usePinnedStore.getState()
    // Deduplicate by filePath
    for (const fp of pendingSyncs) {
      const pinsForFile = store.pinnedGroups
        .filter((p) => p.filePath === fp)
        .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
      if (pinsForFile.length === 0) continue

      const isMulti = pinsForFile.length > 1 || pinsForFile[0].groupIndex !== undefined

      const serializePin = (p: PinnedGroup) => ({
        name: p.name,
        cwd: p.cwd,
        color: p.color,
        ...(p.toolbar ? { toolbar: true } : {}),
        ...(p.logo ? { logo: p.logo } : {}),
        sessions: p.sessions.map((s) => ({ cwd: s.cwd, name: s.name, claudeMode: s.claudeMode, dangerousMode: s.dangerousMode })),
        terminals: p.terminals.map((t) => ({ command: t.command, commandMode: t.commandMode, color: t.color, icon: t.icon, autoLaunchLocalhost: t.autoLaunchLocalhost }))
      })

      const writeData = isMulti
        ? { groups: pinsForFile.map(serializePin) }
        : serializePin(pinsForFile[0])

      window.electronAPI?.writeClaveFile(fp, writeData)
        .catch((err) => console.error('[clave] Failed to write .clave file:', err))
    }
    pendingSyncs.clear()
    syncTimer = null
  }, 300)
}

// ── Import / Export ──

function createPinnedFromGroup(
  g: { name: string; cwd: string; color: string | null; toolbar?: boolean; logo?: string; sessions: { cwd: string; name: string; claudeMode: boolean; dangerousMode: boolean }[]; terminals: { command: string; commandMode: 'prefill' | 'auto'; color: string; icon?: string }[] },
  filePath: string,
  groupIndex?: number
): PinnedGroup {
  return {
    id: crypto.randomUUID(),
    name: g.name,
    cwd: g.cwd,
    color: (g.color as GroupTerminalColor) ?? null,
    sessions: g.sessions,
    terminals: groupDataToPinnedTerminals(g.terminals),
    createdAt: Date.now(),
    filePath,
    groupIndex,
    toolbar: g.toolbar,
    logo: g.logo,
    activeGroupId: null,
    visible: false
  }
}

function groupDataToPinnedTerminals(terminals: { command: string; commandMode: 'prefill' | 'auto'; color: string; icon?: string; autoLaunchLocalhost?: boolean }[]): PinnedGroupTerminal[] {
  return terminals.map((t) => ({
    command: t.command,
    commandMode: t.commandMode,
    color: t.color as GroupTerminalColor,
    icon: t.icon as PinnedGroupTerminal['icon'],
    autoLaunchLocalhost: t.autoLaunchLocalhost
  }))
}

/** Import a .clave file as pinned group(s) and optionally auto-launch.
 *  Returns info about the first pin, and whether it already existed. */
export async function importClaveFile(filePath: string, options?: { autoLaunch?: boolean }): Promise<{ pinnedId: string; alreadyExists: boolean } | null> {
  const result = await window.electronAPI?.readClaveFile(filePath)
  if (!result) return null

  const autoLaunch = options?.autoLaunch ?? true

  // Normalize to array of groups
  const groups = result.type === 'multi'
    ? result.groups
    : [{ name: result.name, cwd: result.cwd, color: result.color, toolbar: result.toolbar, logo: result.logo, sessions: result.sessions, terminals: result.terminals }]

  // Check if already imported — reuse existing pins
  const existingPins = usePinnedStore.getState().pinnedGroups.filter((pg) => pg.filePath === filePath)
  if (existingPins.length > 0) {
    // Update existing pins from the file
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      const existing = existingPins.find((p) => p.groupIndex === i) ?? existingPins[i]
      if (existing) {
        usePinnedStore.getState().updatePinnedGroup(existing.id, {
          name: g.name,
          cwd: g.cwd,
          color: (g.color as GroupTerminalColor) ?? null,
          sessions: g.sessions,
          terminals: groupDataToPinnedTerminals(g.terminals),
          groupIndex: result.type === 'multi' ? i : undefined,
          toolbar: g.toolbar,
          logo: g.logo
        })
        if (autoLaunch) {
          const state = getPinnedState(existing)
          if (state === 'idle' || state === 'active-hidden') {
            await togglePinnedGroup(existing.id)
          }
        }
      }
    }
    // Add any new groups that weren't in existing pins
    for (let i = existingPins.length; i < groups.length; i++) {
      const g = groups[i]
      const pinned = createPinnedFromGroup(g, filePath, result.type === 'multi' ? i : undefined)
      usePinnedStore.getState().addPinnedGroup(pinned)
      if (autoLaunch) await togglePinnedGroup(pinned.id)
    }
    return { pinnedId: existingPins[0].id, alreadyExists: true }
  }

  // Fresh import
  window.electronAPI?.watchClaveFile(filePath).catch(() => {})

  let firstId: string | null = null
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    const pinned = createPinnedFromGroup(g, filePath, result.type === 'multi' ? i : undefined)
    usePinnedStore.getState().addPinnedGroup(pinned)
    if (!firstId) firstId = pinned.id
    if (autoLaunch) await togglePinnedGroup(pinned.id)
  }

  return firstId ? { pinnedId: firstId, alreadyExists: false } : null
}

/** Get the default file name for a pinned group export */
export function getExportFileName(pinnedId: string): string {
  const pg = usePinnedStore.getState().pinnedGroups.find((p) => p.id === pinnedId)
  if (!pg) return 'group.clave'
  return `${pg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.clave`
}

/** Export a pinned group to a .clave file at the specified path */
export async function exportClaveFile(pinnedId: string, folder: string, fileName: string, keepSynced: boolean): Promise<void> {
  const pg = usePinnedStore.getState().pinnedGroups.find((p) => p.id === pinnedId)
  if (!pg) return

  const filePath = `${folder}/${fileName}`

  await window.electronAPI?.writeClaveFile(filePath, {
    name: pg.name,
    cwd: pg.cwd,
    color: pg.color,
    sessions: pg.sessions.map((s) => ({
      cwd: s.cwd,
      name: s.name,
      claudeMode: s.claudeMode,
      dangerousMode: s.dangerousMode
    })),
    terminals: pg.terminals.map((t) => ({
      command: t.command,
      commandMode: t.commandMode,
      color: t.color,
      icon: t.icon
    }))
  })

  if (keepSynced) {
    usePinnedStore.getState().updatePinnedGroup(pinnedId, { filePath })
    window.electronAPI?.watchClaveFile(filePath).catch(() => {})
  }
}

// ── File watch handler ──

/** Initialize file watchers for all file-backed pins and set up the listener */
export function initClaveFileWatchers(): () => void {
  // Start watching all file-backed pins
  const pins = usePinnedStore.getState().pinnedGroups
  for (const pg of pins) {
    if (pg.filePath) {
      window.electronAPI?.watchClaveFile(pg.filePath).catch(() => {})
    }
  }

  // Listen for file change events
  const cleanup = window.electronAPI?.onClaveFileChanged(async (filePath: string) => {
    const pinsForFile = usePinnedStore.getState().pinnedGroups.filter((p) => p.filePath === filePath)
    if (pinsForFile.length === 0) return

    const result = await window.electronAPI?.readClaveFile(filePath)
    if (!result) return

    // Normalize to array of groups
    const groups = result.type === 'multi'
      ? result.groups
      : [{ name: result.name, cwd: result.cwd, color: result.color, toolbar: result.toolbar, logo: result.logo, sessions: result.sessions, terminals: result.terminals }]

    for (let i = 0; i < pinsForFile.length && i < groups.length; i++) {
      const pg = pinsForFile.find((p) => p.groupIndex === i) ?? pinsForFile[i]
      const g = groups[i]
      if (!pg || !g) continue

      const state = getPinnedState(pg)

      if (state === 'idle') {
        usePinnedStore.getState().updatePinnedGroup(pg.id, {
          name: g.name,
          cwd: g.cwd,
          color: (g.color as GroupTerminalColor) ?? null,
          toolbar: g.toolbar,
          logo: g.logo,
          sessions: g.sessions,
          terminals: groupDataToPinnedTerminals(g.terminals)
        })
      } else {
        // Active — only cosmetic updates, never touch running sessions
        usePinnedStore.getState().updatePinnedGroup(pg.id, {
          name: g.name,
          color: (g.color as GroupTerminalColor) ?? null,
          toolbar: g.toolbar,
          logo: g.logo,
          terminals: groupDataToPinnedTerminals(g.terminals)
        })

        if (pg.activeGroupId) {
          const sessionState = useSessionStore.getState()
          const group = sessionState.groups.find((gr) => gr.id === pg.activeGroupId)
          if (group) {
            if (group.name !== g.name) {
              useSessionStore.getState().renameGroup(pg.activeGroupId, g.name)
            }
            const newColor = (g.color as GroupTerminalColor) ?? null
            if ((group.color ?? null) !== newColor) {
              useSessionStore.getState().setGroupColor(pg.activeGroupId, newColor)
            }
          }
        }
      }
    }
  })

  return cleanup ?? (() => {})
}

// ── Original functions (unchanged) ──

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
    color: t.color,
    icon: t.icon
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
              icon: t.icon,
              autoLaunchLocalhost: t.autoLaunchLocalhost,
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

/** Remove a pinned group — only removes the pin, never kills running sessions */
export function removePinnedGroupWithCleanup(pinnedId: string): void {
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
    color: t.color,
    icon: t.icon
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
    // Sync to .clave file if backed
    const updated = next.find((p) => p.id === pg.id)
    if (updated) syncToClaveFile(updated)
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
    if (t.command !== pt.command || t.commandMode !== pt.commandMode || t.color !== pt.color || (t.icon ?? 'terminal') !== (pt.icon ?? 'terminal')) return true
  }

  return false
}

// Auto-sync group name/color changes to linked pinned buttons + .clave files
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
    // Sync changed pins to .clave files
    for (const pg of updated) {
      if (pg.filePath) syncToClaveFile(pg)
    }
  }
})
