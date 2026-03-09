import { useEffect, useRef } from 'react'
import { useSessionStore, type Session, type SessionGroup, type ActiveView, type GroupTerminalColor, type Theme } from '../store/session-store'

export function useSessionRestore(): void {
  const didRun = useRef(false)

  useEffect(() => {
    if (didRun.current) return
    didRun.current = true
    restoreSessions()
  }, [])
}

async function restoreSessions(): Promise<void> {
  const persisted = await window.electronAPI.loadSessionState()
  if (!persisted) {
    useSessionStore.getState().setRestoredFromDisk(false)
    return
  }

  // Restore theme immediately (even if no sessions to restore)
  if (persisted.theme) {
    useSessionStore.getState().setTheme(persisted.theme as Theme)
  }

  if (persisted.sessions.length === 0) {
    useSessionStore.getState().setRestoredFromDisk(false)
    return
  }

  const { restoreState, setClaudeSessionId } = useSessionStore.getState()

  // Check for existing live PTYs in the main process.
  // After a renderer crash/reload, PTYs survive in the main process —
  // reconnect to them instead of spawning duplicates.
  const livePtys = await window.electronAPI.listSessions()
  const livePtyMap = new Map(
    livePtys.filter((p) => p.alive).map((p) => [p.id, p])
  )

  // Spawn or reconnect all sessions in parallel
  const results = await Promise.allSettled(
    persisted.sessions.map(async (ps) => {
      // Try to reconnect to an existing live PTY (same ID still alive in main process)
      const existingPty = livePtyMap.get(ps.id)
      if (existingPty) {
        console.log(`[session-restore] Reconnected to live PTY "${ps.name}" (${ps.id})`)
        return { persisted: ps, sessionInfo: existingPty, reconnected: true }
      }

      // No live PTY — spawn a new one
      const sessionInfo = await window.electronAPI.spawnSession(ps.cwd, {
        claudeMode: ps.claudeMode,
        dangerousMode: ps.dangerousMode,
        resumeSessionId: ps.claudeMode ? (ps.claudeSessionId ?? undefined) : undefined
      })

      // Listen for Claude session ID detection
      if (ps.claudeMode) {
        window.electronAPI.onClaudeSessionDetected(sessionInfo.id, (claudeSessionId) => {
          setClaudeSessionId(sessionInfo.id, claudeSessionId)
        })
      }

      console.log(`[session-restore] Spawned new PTY "${ps.name}" (${sessionInfo.id})`)
      return { persisted: ps, sessionInfo, reconnected: false }
    })
  )

  // Map from old persisted session ID to new/same PTY session ID
  const idMap = new Map<string, string>()
  const restoredSessions: Session[] = []

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Failed to restore session:', result.reason)
      continue
    }
    const { persisted: ps, sessionInfo, reconnected } = result.value
    // Reconnected sessions keep the same ID; new sessions get a new ID
    const newId = reconnected ? ps.id : sessionInfo.id
    idMap.set(ps.id, newId)
    restoredSessions.push({
      id: newId,
      cwd: sessionInfo.cwd,
      folderName: sessionInfo.folderName,
      name: ps.name,
      alive: sessionInfo.alive,
      activityStatus: 'idle',
      promptWaiting: null,
      claudeMode: ps.claudeMode,
      dangerousMode: ps.dangerousMode,
      claudeSessionId: ps.claudeSessionId
    })
  }

  if (restoredSessions.length === 0) return

  // Remap group session IDs and display order
  const restoredGroups: SessionGroup[] = persisted.groups
    .map((g) => ({
      ...g,
      color: (g.color as GroupTerminalColor) ?? undefined,
      sessionIds: g.sessionIds
        .map((sid) => idMap.get(sid))
        .filter((sid): sid is string => sid !== undefined),
      terminals: g.terminals.map((t) => ({
        ...t,
        color: t.color as GroupTerminalColor,
        sessionId: null
      }))
    }))
    .filter((g) => g.sessionIds.length > 0)

  const restoredGroupIds = new Set(restoredGroups.map((g) => g.id))
  const restoredDisplayOrder = persisted.displayOrder
    .map((id) => idMap.get(id) ?? (restoredGroupIds.has(id) ? id : null))
    .filter((id): id is string => id !== null)

  // Add any sessions not in the display order
  for (const s of restoredSessions) {
    if (!restoredDisplayOrder.includes(s.id)) {
      const inGroup = restoredGroups.some((g) => g.sessionIds.includes(s.id))
      if (!inGroup) restoredDisplayOrder.push(s.id)
    }
  }

  const focusedSessionId = persisted.focusedSessionId
    ? (idMap.get(persisted.focusedSessionId) ?? restoredSessions[0]?.id ?? null)
    : (restoredSessions[0]?.id ?? null)

  const selectedSessionIds = persisted.selectedSessionIds
    .map((sid) => idMap.get(sid))
    .filter((sid): sid is string => sid !== undefined)

  restoreState({
    sessions: restoredSessions,
    groups: restoredGroups,
    displayOrder: restoredDisplayOrder,
    focusedSessionId,
    selectedSessionIds: selectedSessionIds.length > 0 ? selectedSessionIds : (focusedSessionId ? [focusedSessionId] : []),
    sidebarOpen: persisted.sidebarOpen,
    sidebarWidth: persisted.sidebarWidth,
    activeView: (persisted.activeView as ActiveView) || 'terminals'
  })

  useSessionStore.getState().setRestoredFromDisk(true)
}
