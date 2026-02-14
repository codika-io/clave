import { useState, useCallback, useMemo } from 'react'
import { useBoardStore } from '../../store/board-store'
import { useSessionStore } from '../../store/session-store'
import { useBoardPersistence, useBoardAutoComplete } from '../../hooks/use-board-persistence'
import { BoardColumn } from './BoardColumn'
import { TaskForm } from './TaskForm'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { cn } from '../../lib/utils'
import type { BoardTask } from '../../../../preload/index.d'

export function KanbanBoard() {
  const tasks = useBoardStore((s) => s.tasks)
  const cwdFilter = useBoardStore((s) => s.cwdFilter)
  const setCwdFilter = useBoardStore((s) => s.setCwdFilter)
  const moveTask = useBoardStore((s) => s.moveTask)
  const linkSession = useBoardStore((s) => s.linkSession)
  const reorderTask = useBoardStore((s) => s.reorderTask)

  const sessions = useSessionStore((s) => s.sessions)
  const addSession = useSessionStore((s) => s.addSession)
  const removeSession = useSessionStore((s) => s.removeSession)

  const [formOpen, setFormOpen] = useState(false)
  const [editTask, setEditTask] = useState<BoardTask | null>(null)
  const [pendingDoneTask, setPendingDoneTask] = useState<{
    taskId: string
    sessionId: string
    order: number
  } | null>(null)

  useBoardPersistence()
  useBoardAutoComplete()

  // Unique cwds for filter chips
  const uniqueCwds = useMemo(() => {
    const cwds = new Set(tasks.map((t) => t.cwd))
    return Array.from(cwds).sort()
  }, [tasks])

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    if (!cwdFilter) return tasks
    return tasks.filter((t) => t.cwd === cwdFilter)
  }, [tasks, cwdFilter])

  const todoTasks = useMemo(() => filteredTasks.filter((t) => t.status === 'todo'), [filteredTasks])
  const processingTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === 'processing'),
    [filteredTasks]
  )
  const doneTasks = useMemo(() => filteredTasks.filter((t) => t.status === 'done'), [filteredTasks])

  const handleEdit = useCallback((task: BoardTask) => {
    setEditTask(task)
    setFormOpen(true)
  }, [])

  const handleNewTask = useCallback(() => {
    setEditTask(null)
    setFormOpen(true)
  }, [])

  const handleCloseForm = useCallback(() => {
    setFormOpen(false)
    setEditTask(null)
  }, [])

  const startTask = useCallback(
    async (task: BoardTask) => {
      if (!window.electronAPI?.spawnSession) return

      const state = useSessionStore.getState()
      const sessionInfo = await window.electronAPI.spawnSession(task.cwd, {
        dangerousMode: state.dangerousMode,
        claudeMode: true
      })

      addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: task.title,
        alive: sessionInfo.alive,
        activityStatus: 'idle'
      })

      linkSession(task.id, sessionInfo.id)
      moveTask(task.id, 'processing')

      // Write prompt after Claude Code finishes initializing.
      // Claude Code outputs a burst of data during startup (loading animation,
      // welcome text, etc.), then goes quiet when waiting for input.
      // We detect this "quiet after burst" by debouncing data events:
      // once 2 seconds pass without new output, Claude Code is ready.
      if (task.prompt) {
        let sent = false
        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        const sendPrompt = (): void => {
          if (sent) return
          sent = true
          if (debounceTimer) clearTimeout(debounceTimer)
          // Write text first, then send Enter separately after a short delay.
          // If sent together, ink-based TUIs treat the whole chunk as pasted
          // text and interpret \r as a literal newline instead of submit.
          window.electronAPI?.writeSession(sessionInfo.id, task.prompt)
          setTimeout(() => {
            window.electronAPI?.writeSession(sessionInfo.id, '\r')
          }, 150)
          cleanup?.()
        }

        const cleanup = window.electronAPI?.onSessionData(sessionInfo.id, () => {
          if (sent) return
          // Reset debounce on each data event
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(sendPrompt, 2000)
        })

        // Fallback: send after 20s even if silence detection fails
        setTimeout(sendPrompt, 20000)
      }
    },
    [addSession, linkSession, moveTask]
  )

  const cleanupSession = useCallback(
    async (sessionId: string) => {
      try {
        await window.electronAPI?.killSession(sessionId)
      } catch {
        // session may already be dead
      }
      removeSession(sessionId)
    },
    [removeSession]
  )

  const handleConfirmDone = useCallback(async () => {
    if (!pendingDoneTask) return
    const { taskId, sessionId, order } = pendingDoneTask
    await cleanupSession(sessionId)
    moveTask(taskId, 'done')
    reorderTask(taskId, order)
    setPendingDoneTask(null)
  }, [pendingDoneTask, cleanupSession, moveTask, reorderTask])

  const handleCancelDone = useCallback(() => {
    setPendingDoneTask(null)
  }, [])

  const handleReorder = useCallback(
    (taskId: string, newOrder: number, newStatus: BoardTask['status']) => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return

      // Intercept processing → done when task has a linked session
      if (newStatus === 'done' && task.status === 'processing' && task.sessionId) {
        const session = sessions.find((s) => s.id === task.sessionId)
        if (session?.alive) {
          // Session still running — ask for confirmation
          setPendingDoneTask({ taskId, sessionId: task.sessionId, order: newOrder })
          return
        }
        // Session already dead — clean up silently and move
        cleanupSession(task.sessionId)
        moveTask(taskId, 'done')
        reorderTask(taskId, newOrder)
        return
      }

      if (task.status !== newStatus) {
        moveTask(taskId, newStatus)
      }
      reorderTask(taskId, newOrder)
    },
    [tasks, sessions, moveTask, reorderTask, cleanupSession]
  )

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-0">
      {/* Filter bar */}
      {uniqueCwds.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setCwdFilter(null)}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex-shrink-0',
              !cwdFilter
                ? 'bg-accent/15 text-accent'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-200'
            )}
          >
            All
          </button>
          {uniqueCwds.map((cwd) => {
            const label = cwd.split('/').pop() || cwd
            return (
              <button
                key={cwd}
                onClick={() => setCwdFilter(cwdFilter === cwd ? null : cwd)}
                title={cwd}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex-shrink-0 truncate max-w-[140px]',
                  cwdFilter === cwd
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-200'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Columns */}
      <div className="flex-1 flex justify-center gap-4 p-4 overflow-x-auto min-h-0">
        <BoardColumn
          title="Todo"
          status="todo"
          tasks={todoTasks}
          onEdit={handleEdit}
          onStart={startTask}
          onNewTask={handleNewTask}
          onReorder={handleReorder}
        />
        <BoardColumn
          title="Processing"
          status="processing"
          tasks={processingTasks}
          onEdit={handleEdit}
          onReorder={handleReorder}
        />
        <BoardColumn
          title="Done"
          status="done"
          tasks={doneTasks}
          onEdit={handleEdit}
          onReorder={handleReorder}
        />
      </div>

      <TaskForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        editTask={editTask}
      />

      <ConfirmDialog
        isOpen={!!pendingDoneTask}
        onConfirm={handleConfirmDone}
        onCancel={handleCancelDone}
        title="Complete task"
        message="The linked session is still running. Completing this task will kill the session. Are you sure?"
      />
    </div>
  )
}
