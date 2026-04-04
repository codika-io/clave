import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store/session-store'
import { useBoardStore } from '../store/board-store'

/**
 * Subscribes to session store changes and syncs with the board:
 *
 * 1. Session ends (alive: true → false) → move card to terminal-behavior column
 * 2. New Claude-mode session appears → auto-create a board card in active column
 *
 * Startup sessions (templates, pinned groups) are skipped because they exist
 * in the initial snapshot — only sessions appearing AFTER init trigger card creation.
 */
export function useBoardSessionSync(): void {
  const prevSessionIdsRef = useRef<Set<string>>(new Set())
  const prevAliveRef = useRef<Map<string, boolean>>(new Map())

  useEffect(() => {
    // Build initial snapshot — these are startup sessions, skip them
    const sessions = useSessionStore.getState().sessions
    const initialIds = new Set<string>()
    const initialAlive = new Map<string, boolean>()
    for (const s of sessions) {
      initialIds.add(s.id)
      initialAlive.set(s.id, s.alive)
    }
    prevSessionIdsRef.current = initialIds
    prevAliveRef.current = initialAlive

    const unsub = useSessionStore.subscribe((state) => {
      const boardState = useBoardStore.getState()
      if (!boardState.loaded) return

      const prevIds = prevSessionIdsRef.current
      const prevAlive = prevAliveRef.current

      // Build a set of session IDs already linked to board tasks
      const linkedSessionIds = new Set<string>()
      for (const task of boardState.tasks) {
        if (task.sessionId) linkedSessionIds.add(task.sessionId)
      }

      for (const session of state.sessions) {
        // --- New session detection ---
        if (!prevIds.has(session.id)) {
          if (
            session.claudeMode &&
            session.sessionType === 'local' &&
            !linkedSessionIds.has(session.id)
          ) {
            const activeCol = boardState.getColumnByBehavior('active')
            if (activeCol) {
              useBoardStore.getState().addTask({
                title: session.name || session.folderName,
                prompt: '',
                notes: '',
                cwd: session.cwd,
                dangerousMode: session.dangerousMode,
                tags: [],
                sessionId: session.id,
                claudeSessionId: session.claudeSessionId ?? undefined,
                columnId: activeCol.id
              })
            }
          }
        }

        // --- Session end detection ---
        const wasAlive = prevAlive.get(session.id)
        if (wasAlive === true && session.alive === false) {
          const currentBoardState = useBoardStore.getState()
          const task = currentBoardState.tasks.find((t) => t.sessionId === session.id)
          if (task) {
            const terminalCol = currentBoardState.getColumnByBehavior('terminal')
            if (terminalCol && task.columnId !== terminalCol.id) {
              useBoardStore.getState().moveTask(task.id, terminalCol.id, 0)
            }
          }
        }
      }

      // Update snapshots
      const nextIds = new Set<string>()
      const nextAlive = new Map<string, boolean>()
      for (const s of state.sessions) {
        nextIds.add(s.id)
        nextAlive.set(s.id, s.alive)
      }
      prevSessionIdsRef.current = nextIds
      prevAliveRef.current = nextAlive
    })

    return unsub
  }, [])
}
