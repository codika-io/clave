import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store/session-store'
import { useBoardStore } from '../store/board-store'

/**
 * Subscribes to session store changes and auto-moves board cards
 * when their linked session's state transitions.
 *
 * Transitions handled:
 * - Session ends (alive: false) → move card to terminal-behavior column (Done)
 */
export function useBoardSessionSync(): void {
  // Track previous session states to detect transitions
  const prevSessionsRef = useRef<Map<string, { alive: boolean }>>(new Map())

  useEffect(() => {
    // Build initial snapshot
    const sessions = useSessionStore.getState().sessions
    const initial = new Map<string, { alive: boolean }>()
    for (const s of sessions) {
      initial.set(s.id, { alive: s.alive })
    }
    prevSessionsRef.current = initial

    const unsub = useSessionStore.subscribe((state) => {
      const boardState = useBoardStore.getState()
      const prevSessions = prevSessionsRef.current

      // Build a map of sessionId → task for quick lookup
      const tasksBySessionId = new Map<string, (typeof boardState.tasks)[number]>()
      for (const task of boardState.tasks) {
        if (task.sessionId) {
          tasksBySessionId.set(task.sessionId, task)
        }
      }

      for (const session of state.sessions) {
        const prev = prevSessions.get(session.id)
        const task = tasksBySessionId.get(session.id)
        if (!task) continue

        // Transition: alive → dead → move to terminal column
        if (prev?.alive === true && session.alive === false) {
          const terminalCol = boardState.getColumnByBehavior('terminal')
          if (terminalCol && task.columnId !== terminalCol.id) {
            useBoardStore.getState().moveTask(task.id, terminalCol.id, 0)
          }
        }
      }

      // Update snapshot
      const next = new Map<string, { alive: boolean }>()
      for (const s of state.sessions) {
        next.set(s.id, { alive: s.alive })
      }
      prevSessionsRef.current = next
    })

    return unsub
  }, [])
}
