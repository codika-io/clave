import { useEffect } from 'react'
import { useSessionStore } from '../store/session-store'

function buildPersistedState() {
  const state = useSessionStore.getState()

  // Only persist alive sessions (dead sessions can't be resumed)
  const aliveSessions = state.sessions.filter((s) => s.alive)
  const aliveIds = new Set(aliveSessions.map((s) => s.id))

  // File tab IDs are always valid (no liveness check needed)
  const fileTabIds = new Set(state.fileTabs.map((f) => f.id))
  const validIds = new Set([...aliveIds, ...fileTabIds])

  return {
    sessions: aliveSessions.map((s) => ({
      id: s.id,
      cwd: s.cwd,
      folderName: s.folderName,
      name: s.name,
      claudeMode: s.claudeMode,
      dangerousMode: s.dangerousMode,
      claudeSessionId: s.claudeSessionId
    })),
    groups: state.groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        sessionIds: g.sessionIds.filter((sid) => aliveIds.has(sid)),
        collapsed: g.collapsed,
        cwd: g.cwd,
        terminals: g.terminals.map((t) => ({
          id: t.id,
          command: t.command,
          commandMode: t.commandMode,
          color: t.color
        })),
        color: g.color
      }))
      .filter((g) => g.sessionIds.length > 0),
    displayOrder: state.displayOrder.filter(
      (id) => validIds.has(id) || state.groups.some((g) => g.id === id && g.sessionIds.some((sid) => aliveIds.has(sid)))
    ),
    focusedSessionId: state.focusedSessionId && validIds.has(state.focusedSessionId) ? state.focusedSessionId : null,
    selectedSessionIds: state.selectedSessionIds.filter((sid) => validIds.has(sid)),
    sidebarOpen: state.sidebarOpen,
    sidebarWidth: state.sidebarWidth,
    activeView: state.activeView,
    theme: state.theme,
    fileTabs: state.fileTabs.map((f) => ({
      id: f.id,
      filePath: f.filePath,
      name: f.name
    }))
  }
}

function save(): void {
  const state = buildPersistedState()
  window.electronAPI.saveSessionState(state)
}

function saveSync(): void {
  const state = buildPersistedState()
  window.electronAPI.saveSessionStateSync(state)
}

export function useSessionSave(): void {
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    // Save initial state after a short delay (covers theme + empty session list)
    debounceTimer = setTimeout(save, 2000)

    // Subscribe to all store changes, debounce writes to disk
    const unsubscribe = useSessionStore.subscribe(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(save, 1000)
    })

    // Sync save on window close — blocks unload until the file is written
    const onBeforeUnload = (): void => {
      if (debounceTimer) clearTimeout(debounceTimer)
      saveSync()
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [])
}
