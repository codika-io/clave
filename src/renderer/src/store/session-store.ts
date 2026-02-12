import { create } from 'zustand'

export type Theme = 'dark' | 'light'

export interface Session {
  id: string
  cwd: string
  folderName: string
  name: string
  alive: boolean
}

export interface SessionGroup {
  id: string
  name: string
  sessionIds: string[]
  collapsed: boolean
}

interface SessionState {
  sessions: Session[]
  focusedSessionId: string | null
  selectedSessionIds: string[]
  groups: SessionGroup[]
  sidebarOpen: boolean
  sidebarWidth: number
  theme: Theme
  searchQuery: string
  dangerousMode: boolean

  addSession: (session: Session) => void
  removeSession: (id: string) => void
  selectSession: (id: string, addToSelection: boolean) => void
  selectSessions: (ids: string[]) => void
  setFocusedSession: (id: string) => void
  createGroup: (sessionIds: string[], name?: string) => void
  ungroupSessions: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  toggleTheme: () => void
  updateSessionAlive: (id: string, alive: boolean) => void
  renameSession: (id: string, name: string) => void
  setSearchQuery: (query: string) => void
  toggleDangerousMode: () => void
}

let groupCounter = 0

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  focusedSessionId: null,
  selectedSessionIds: [],
  groups: [],
  sidebarOpen: true,
  sidebarWidth: 260,
  theme: 'dark',
  searchQuery: '',
  dangerousMode: false,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      selectedSessionIds: [session.id],
      focusedSessionId: session.id
    })),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      const selectedSessionIds = state.selectedSessionIds.filter((sid) => sid !== id)
      const groups = state.groups.map((g) => ({
        ...g,
        sessionIds: g.sessionIds.filter((sid) => sid !== id)
      }))

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
          groups
        }
      }

      return { sessions, selectedSessionIds, focusedSessionId, groups }
    }),

  selectSession: (id, addToSelection) =>
    set((state) => {
      if (addToSelection) {
        const isSelected = state.selectedSessionIds.includes(id)
        const newSelected = isSelected
          ? state.selectedSessionIds.filter((sid) => sid !== id)
          : [...state.selectedSessionIds, id]
        const focusedSessionId = isSelected ? (newSelected[0] ?? null) : id
        return { selectedSessionIds: newSelected, focusedSessionId }
      }
      return { selectedSessionIds: [id], focusedSessionId: id }
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
      return { groups: [...groups, newGroup] }
    }),

  ungroupSessions: (groupId) =>
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId)
    })),

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

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(180, Math.min(480, width)) }),

  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

  updateSessionAlive: (id, alive) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, alive } : s))
    })),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name: name.trim() || s.folderName } : s
      )
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleDangerousMode: () => set((state) => ({ dangerousMode: !state.dangerousMode }))
}))
