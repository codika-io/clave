import { useEffect } from 'react'
import { useBoardStore } from '../store/board-store'
import { useSessionStore } from '../store/session-store'

export function useBoardPersistence(): void {
  const loadBoard = useBoardStore((s) => s.loadBoard)
  const loaded = useBoardStore((s) => s.loaded)

  useEffect(() => {
    if (!loaded) {
      loadBoard()
    }
  }, [loaded, loadBoard])
}

export function useBoardAutoComplete(): void {
  const tasks = useBoardStore((s) => s.tasks)
  const completeTask = useBoardStore((s) => s.completeTask)
  const sessions = useSessionStore((s) => s.sessions)

  useEffect(() => {
    const processingTasks = tasks.filter((t) => t.status === 'processing' && t.sessionId)

    for (const task of processingTasks) {
      const session = sessions.find((s) => s.id === task.sessionId)
      if (!session) continue

      // Only auto-complete when the session process has exited.
      // Tasks with a claudeSessionId stay in "processing" (disconnected)
      // so the user can resume them.
      if (!session.alive && session.activityStatus === 'ended') {
        if (task.claudeSessionId) continue
        completeTask(task.id)
      }
    }
  }, [tasks, sessions, completeTask])
}
