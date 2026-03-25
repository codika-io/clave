import { useState, useCallback, useMemo } from 'react'
import { MagnifyingGlassIcon, PlusIcon, FolderIcon } from '@heroicons/react/24/outline'
import { useBoardStore } from '../../store/board-store'
import { useSessionStore } from '../../store/session-store'
import { useBoardPersistence } from '../../hooks/use-board-persistence'
import { TaskForm } from './TaskForm'
import { ContextMenu } from '../ui/ContextMenu'
import { cn } from '../../lib/utils'
import type { BoardTask } from '../../../../preload/index.d'

function shortenCwd(cwd: string): string {
  const parts = cwd.split('/')
  if (parts.length <= 3) return cwd
  return '~/' + parts.slice(-2).join('/')
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function TaskQueue() {
  const tasks = useBoardStore((s) => s.tasks)
  const removeTask = useBoardStore((s) => s.removeTask)
  const deleteTask = useBoardStore((s) => s.deleteTask)

  const addSession = useSessionStore((s) => s.addSession)

  const [formOpen, setFormOpen] = useState(false)
  const [editTask, setEditTask] = useState<BoardTask | null>(null)
  const [search, setSearch] = useState('')

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: { label: string; onClick: () => void; danger?: boolean }[]
  } | null>(null)

  useBoardPersistence()

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks
    const q = search.toLowerCase()
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q) ||
        t.cwd.toLowerCase().includes(q)
    )
  }, [tasks, search])

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

  const runTask = useCallback(
    async (task: BoardTask) => {
      if (!window.electronAPI?.spawnSession) return

      const dangerousMode = task.dangerousMode ?? false
      const sessionInfo = await window.electronAPI.spawnSession(task.cwd, {
        dangerousMode,
        claudeMode: true
      })

      addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: task.title || task.prompt.slice(0, 40),
        alive: sessionInfo.alive,
        activityStatus: 'idle',
        promptWaiting: null,
        claudeMode: true,
        dangerousMode,
        claudeSessionId: sessionInfo.claudeSessionId,
        sessionType: 'local'
      })

      removeTask(task.id)
      useSessionStore.getState().selectSession(sessionInfo.id, false)

      if (task.prompt) {
        let sent = false
        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        const sendPrompt = (): void => {
          if (sent) return
          sent = true
          if (debounceTimer) clearTimeout(debounceTimer)
          window.electronAPI?.writeSession(sessionInfo.id, task.prompt)
          setTimeout(() => {
            window.electronAPI?.writeSession(sessionInfo.id, '\r')
          }, 150)
          cleanup?.()
        }

        const cleanup = window.electronAPI?.onSessionData(sessionInfo.id, () => {
          if (sent) return
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(sendPrompt, 2000)
        })

        setTimeout(sendPrompt, 20000)
      }
    },
    [addSession, removeTask]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, task: BoardTask) => {
      e.preventDefault()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Edit', onClick: () => handleEdit(task) },
          { label: 'Delete', onClick: () => deleteTask(task.id), danger: true }
        ]
      })
    },
    [handleEdit, deleteTask]
  )

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-0">
      {/* Search bar + actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle flex-shrink-0">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks by prompt or folder..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-100 border border-border-subtle text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
          />
        </div>
        <button
          onClick={handleNewTask}
          className="h-9 px-3.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add Task
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
            {tasks.length === 0 ? (
              <>
                <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="opacity-40">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-text-secondary">No tasks yet</span>
                <span className="text-xs mt-1">Create tasks to queue them for later</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-text-secondary">No matching tasks</span>
                <span className="text-xs mt-1">Try a different search term</span>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                onContextMenu={(e) => handleContextMenu(e, task)}
                className="group flex items-center gap-4 px-4 py-3 hover:bg-surface-50 transition-colors cursor-default"
              >
                {/* Left content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {task.title ? (
                      <span className="text-sm font-medium text-text-primary truncate">
                        {task.title}
                      </span>
                    ) : (
                      <span className="text-sm text-text-primary truncate">
                        {task.prompt}
                      </span>
                    )}
                    {task.dangerousMode && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400">
                        skip-perms
                      </span>
                    )}
                  </div>

                  {/* Description line: prompt (if title exists) + metadata */}
                  <div className="flex items-center gap-2 mt-1">
                    {task.title && task.prompt && (
                      <span className="text-xs text-text-tertiary truncate max-w-[300px]">
                        {task.prompt}
                      </span>
                    )}
                    {task.title && task.prompt && (
                      <span className="text-text-tertiary/30">·</span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] text-text-tertiary flex-shrink-0">
                      <FolderIcon className="w-3 h-3" />
                      <span className="truncate max-w-[160px]" title={task.cwd}>
                        {shortenCwd(task.cwd)}
                      </span>
                    </span>
                    <span className="text-text-tertiary/30">·</span>
                    <span className="text-[11px] text-text-tertiary flex-shrink-0">
                      {formatDate(task.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Run button — visible on hover */}
                <button
                  onClick={() => runTask(task)}
                  className={cn(
                    'flex-shrink-0 h-7 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
                    'bg-green-500/10 hover:bg-green-500/20 text-green-500',
                    'opacity-0 group-hover:opacity-100'
                  )}
                  title="Run this task"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor" />
                  </svg>
                  Run
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <TaskForm isOpen={formOpen} onClose={handleCloseForm} editTask={editTask} />

      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
