import { create } from 'zustand'

export type Theme = 'dark' | 'light'

export type ActivityStatus = 'active' | 'idle' | 'ended'

export interface Session {
  id: string
  cwd: string
  folderName: string
  name: string
  alive: boolean
  activityStatus: ActivityStatus
  promptWaiting: string | null
}

export interface SessionGroup {
  id: string
  name: string
  sessionIds: string[]
  collapsed: boolean
}

export type ActiveView = 'terminals' | 'board'

interface SessionState {
  sessions: Session[]
  focusedSessionId: string | null
  selectedSessionIds: string[]
  groups: SessionGroup[]
  displayOrder: string[]
  sidebarOpen: boolean
  sidebarWidth: number
  theme: Theme
  searchQuery: string
  claudeMode: boolean
  dangerousMode: boolean
  filePaletteOpen: boolean
  fileTreeOpen: boolean
  fileTreeWidth: number
  previewFile: string | null
  previewSource: 'palette' | 'tree' | null
  activeView: ActiveView

  addSession: (session: Session) => void
  removeSession: (id: string) => void
  selectSession: (id: string, addToSelection: boolean) => void
  selectSessions: (ids: string[]) => void
  setFocusedSession: (id: string) => void
  createGroup: (sessionIds: string[], name?: string) => void
  ungroupSessions: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  moveItems: (
    itemIds: string[],
    targetId: string,
    position: 'before' | 'after' | 'inside'
  ) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  toggleTheme: () => void
  updateSessionAlive: (id: string, alive: boolean) => void
  setSessionActivity: (id: string, status: ActivityStatus) => void
  setSessionPromptWaiting: (id: string, promptType: string | null) => void
  renameSession: (id: string, name: string) => void
  setSearchQuery: (query: string) => void
  toggleClaudeMode: () => void
  toggleDangerousMode: () => void
  toggleFilePalette: () => void
  setFilePaletteOpen: (open: boolean) => void
  toggleFileTree: () => void
  setFileTreeWidth: (width: number) => void
  setActiveView: (view: ActiveView) => void
  setPreviewFile: (path: string | null, source?: 'palette' | 'tree') => void
}

let groupCounter = 0

function getDisplayOrder(state: {
  sessions: Session[]
  groups: SessionGroup[]
  displayOrder: string[]
}): string[] {
  if (state.displayOrder.length > 0) return [...state.displayOrder]
  const order: string[] = []
  const placedGroups = new Set<string>()
  for (const session of state.sessions) {
    const group = state.groups.find((g) => g.sessionIds.includes(session.id))
    if (group) {
      if (!placedGroups.has(group.id)) {
        placedGroups.add(group.id)
        order.push(group.id)
      }
    } else {
      order.push(session.id)
    }
  }
  return order
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  focusedSessionId: null,
  selectedSessionIds: [],
  groups: [],
  displayOrder: [],
  sidebarOpen: true,
  sidebarWidth: 260,
  theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  searchQuery: '',
  claudeMode: true,
  dangerousMode: false,
  filePaletteOpen: false,
  fileTreeOpen: false,
  fileTreeWidth: 240,
  previewFile: null,
  previewSource: null,
  activeView: 'terminals' as ActiveView,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      selectedSessionIds: [session.id],
      focusedSessionId: session.id,
      displayOrder: [...getDisplayOrder(state), session.id]
    })),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      const selectedSessionIds = state.selectedSessionIds.filter((sid) => sid !== id)
      const groups = state.groups.map((g) => ({
        ...g,
        sessionIds: g.sessionIds.filter((sid) => sid !== id)
      }))
      const displayOrder = getDisplayOrder(state).filter((did) => did !== id)

      let focusedSessionId = state.focusedSessionId
      if (focusedSessionId === id) {
        focusedSessionId = selectedSessionIds[0] ?? sessions[sessions.length - 1]?.id ?? null
      }
      if (selectedSessionIds.length === 0 && sessions.length > 0) {
        const lastId = sessions[sessions.length - 1].id
        return {
          sessions,
          selectedSessionIds: [lastId],
          focusedSessionId: lastId,
          groups,
          displayOrder
        }
      }

      return { sessions, selectedSessionIds, focusedSessionId, groups, displayOrder }
    }),

  selectSession: (id, addToSelection) =>
    set((state) => {
      if (addToSelection) {
        const isSelected = state.selectedSessionIds.includes(id)
        const newSelected = isSelected
          ? state.selectedSessionIds.filter((sid) => sid !== id)
          : [...state.selectedSessionIds, id]
        const focusedSessionId = isSelected ? (newSelected[0] ?? null) : id
        return { selectedSessionIds: newSelected, focusedSessionId, activeView: 'terminals' as ActiveView }
      }
      return { selectedSessionIds: [id], focusedSessionId: id, activeView: 'terminals' as ActiveView }
    }),

  selectSessions: (ids) =>
    set(() => ({
      selectedSessionIds: ids,
      focusedSessionId: ids[0] ?? null
    })),

  setFocusedSession: (id) => set(() => ({ focusedSessionId: id })),

  createGroup: (sessionIds, name?) =>
    set((state) => {
      groupCounter++
      const groupName = name || `Group ${groupCounter}`
      const newGroup: SessionGroup = {
        id: `group-${Date.now()}-${groupCounter}`,
        name: groupName,
        sessionIds: [...sessionIds],
        collapsed: false
      }
      // Remove these sessions from any existing groups
      const groups = state.groups.map((g) => ({
        ...g,
        sessionIds: g.sessionIds.filter((sid) => !sessionIds.includes(sid))
      }))

      // Update displayOrder: replace first session with group ID, remove rest
      let displayOrder = getDisplayOrder(state)
      let inserted = false
      displayOrder = displayOrder.reduce<string[]>((acc, id) => {
        if (sessionIds.includes(id)) {
          if (!inserted) {
            inserted = true
            acc.push(newGroup.id)
          }
        } else {
          acc.push(id)
        }
        return acc
      }, [])
      if (!inserted) displayOrder.push(newGroup.id)

      return { groups: [...groups, newGroup], displayOrder }
    }),

  ungroupSessions: (groupId) =>
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return {}

      // Replace group ID in displayOrder with its session IDs
      const displayOrder = getDisplayOrder(state)
      const idx = displayOrder.indexOf(groupId)
      if (idx !== -1) {
        displayOrder.splice(idx, 1, ...group.sessionIds)
      }

      return {
        groups: state.groups.filter((g) => g.id !== groupId),
        displayOrder
      }
    }),

  renameGroup: (groupId, name) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, name: name.trim() || 'Group' } : g
      )
    })),

  toggleGroupCollapsed: (groupId) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
    })),

  moveItems: (itemIds, targetId, position) =>
    set((state) => {
      const displayOrder = getDisplayOrder(state)
      const newGroups = state.groups.map((g) => ({
        ...g,
        sessionIds: [...g.sessionIds]
      }))

      const targetIsGroup = newGroups.some((g) => g.id === targetId)
      const targetParentGroup = newGroups.find((g) => g.sessionIds.includes(targetId))

      // Remove dragged items from current locations
      for (const id of itemIds) {
        const idx = displayOrder.indexOf(id)
        if (idx !== -1) displayOrder.splice(idx, 1)
        for (const g of newGroups) {
          const sIdx = g.sessionIds.indexOf(id)
          if (sIdx !== -1) g.sessionIds.splice(sIdx, 1)
        }
      }

      if (position === 'inside' && targetIsGroup) {
        // Drop into group
        const group = newGroups.find((g) => g.id === targetId)!
        group.sessionIds.push(...itemIds)
      } else if (targetParentGroup && !targetIsGroup) {
        // Target is inside a group → reorder within group
        const idx = targetParentGroup.sessionIds.indexOf(targetId)
        const insertIdx = position === 'after' ? idx + 1 : idx
        targetParentGroup.sessionIds.splice(insertIdx, 0, ...itemIds)
      } else {
        // Target is top-level → reorder in displayOrder
        const idx = displayOrder.indexOf(targetId)
        if (idx === -1) {
          displayOrder.push(...itemIds)
        } else {
          const insertIdx = position === 'after' ? idx + 1 : idx
          displayOrder.splice(insertIdx, 0, ...itemIds)
        }
      }

      // Remove empty groups
      const emptyGroupIds = newGroups
        .filter((g) => g.sessionIds.length === 0)
        .map((g) => g.id)
      const finalGroups = newGroups.filter((g) => g.sessionIds.length > 0)
      const finalDisplayOrder = displayOrder.filter((id) => !emptyGroupIds.includes(id))

      return { displayOrder: finalDisplayOrder, groups: finalGroups }
    }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(180, Math.min(480, width)) }),

  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

  updateSessionAlive: (id, alive) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, alive, ...(!alive && { activityStatus: 'ended' as const }) } : s
      )
    })),

  setSessionActivity: (id, status) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id)
      if (!session || session.activityStatus === status) return state
      return {
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, activityStatus: status } : s))
      }
    }),

  setSessionPromptWaiting: (id, promptType) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, promptWaiting: promptType } : s
      )
    })),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name: name.trim() || s.folderName } : s
      )
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleClaudeMode: () => set((state) => ({ claudeMode: !state.claudeMode })),

  toggleDangerousMode: () => set((state) => ({ dangerousMode: !state.dangerousMode })),

  toggleFilePalette: () => set((state) => ({ filePaletteOpen: !state.filePaletteOpen })),

  setFilePaletteOpen: (open) => set({ filePaletteOpen: open }),

  toggleFileTree: () => set((state) => ({ fileTreeOpen: !state.fileTreeOpen })),

  setFileTreeWidth: (width) => set({ fileTreeWidth: Math.max(180, Math.min(400, width)) }),

  setActiveView: (view) => set({ activeView: view }),

  setPreviewFile: (path, source) =>
    set({ previewFile: path, previewSource: source ?? (path ? null : null) })
}))
