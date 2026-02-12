import { create } from 'zustand'

export type LayoutMode = 'single' | 'split-2' | 'grid-4'
export type Theme = 'dark' | 'light'

export interface Session {
  id: string
  cwd: string
  folderName: string
  alive: boolean
}

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  visibleSessionIds: string[]
  layoutMode: LayoutMode
  sidebarOpen: boolean
  theme: Theme

  addSession: (session: Session) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string) => void
  setLayoutMode: (mode: LayoutMode) => void
  toggleSidebar: () => void
  toggleTheme: () => void
  updateSessionAlive: (id: string, alive: boolean) => void
}

function computeVisibleSessions(
  sessions: Session[],
  activeId: string | null,
  mode: LayoutMode
): string[] {
  const maxSlots = mode === 'single' ? 1 : mode === 'split-2' ? 2 : 4
  if (sessions.length === 0 || !activeId) return []

  if (mode === 'single') {
    return [activeId]
  }

  // For multi-panel modes, maintain session creation order (stable DOM positions).
  // Ensure the active session is included; if there are more sessions than slots,
  // pick the window of sessions that contains the active one.
  const ids = sessions.map((s) => s.id)
  const activeIndex = ids.indexOf(activeId)
  if (activeIndex === -1) return ids.slice(0, maxSlots)

  // If all sessions fit, show them all in creation order
  if (ids.length <= maxSlots) return ids

  // Otherwise, pick a window that includes the active session
  let start = Math.max(0, activeIndex - maxSlots + 1)
  if (start + maxSlots > ids.length) start = ids.length - maxSlots
  return ids.slice(start, start + maxSlots)
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,
  visibleSessionIds: [],
  layoutMode: 'single',
  sidebarOpen: true,
  theme: 'dark',

  addSession: (session) =>
    set((state) => {
      const sessions = [...state.sessions, session]
      const activeSessionId = session.id
      const visibleSessionIds = computeVisibleSessions(sessions, activeSessionId, state.layoutMode)
      return { sessions, activeSessionId, visibleSessionIds }
    }),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      const activeSessionId =
        state.activeSessionId === id
          ? (sessions[sessions.length - 1]?.id ?? null)
          : state.activeSessionId
      return {
        sessions,
        activeSessionId,
        visibleSessionIds: computeVisibleSessions(sessions, activeSessionId, state.layoutMode)
      }
    }),

  setActiveSession: (id) =>
    set((state) => {
      if (state.activeSessionId === id) return state
      const newVisible = computeVisibleSessions(state.sessions, id, state.layoutMode)
      return {
        activeSessionId: id,
        visibleSessionIds: arraysEqual(state.visibleSessionIds, newVisible)
          ? state.visibleSessionIds
          : newVisible
      }
    }),

  setLayoutMode: (mode) =>
    set((state) => ({
      layoutMode: mode,
      visibleSessionIds: computeVisibleSessions(state.sessions, state.activeSessionId, mode)
    })),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

  updateSessionAlive: (id, alive) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, alive } : s))
    }))
}))
