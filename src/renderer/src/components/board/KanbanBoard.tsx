import { useState, useCallback, useMemo } from 'react'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useBoardStore } from '../../store/board-store'
import { useSessionStore } from '../../store/session-store'
import { useBoardPersistence } from '../../hooks/use-board-persistence'
import { KanbanColumn } from './KanbanColumn'
import { useBoardDnd } from '../../hooks/use-board-dnd'
import { TaskForm } from './TaskForm'
import { TaskDetailPanel } from './TaskDetailPanel'
import { ContextMenu } from '../ui/ContextMenu'
import type { BoardTask } from '../../../../preload/index.d'

export function TaskQueue() {
  const tasks = useBoardStore((s) => s.tasks)
  const columns = useBoardStore((s) => s.columns)
  const deleteTask = useBoardStore((s) => s.deleteTask)
  const moveTask = useBoardStore((s) => s.moveTask)
  const updateTask = useBoardStore((s) => s.updateTask)
  const addColumn = useBoardStore((s) => s.addColumn)
  const updateColumn = useBoardStore((s) => s.updateColumn)
  const deleteColumn = useBoardStore((s) => s.deleteColumn)
  const getColumnByBehavior = useBoardStore((s) => s.getColumnByBehavior)

  const addSession = useSessionStore((s) => s.addSession)

  useBoardPersistence()

  const { draggingTaskId, dropTarget, onPointerDown } = useBoardDnd()

  const [formOpen, setFormOpen] = useState(false)
  const [formColumnId, setFormColumnId] = useState<string | undefined>(undefined)
  const [editTask, setEditTask] = useState<BoardTask | null>(null)
  const [detailTask, setDetailTask] = useState<BoardTask | null>(null)
  const [search, setSearch] = useState('')

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: { label: string; onClick: () => void; danger?: boolean }[]
  } | null>(null)

  const sortedColumns = useMemo(() => [...columns].sort((a, b) => a.order - b.order), [columns])

  const inboxColumnCount = useMemo(
    () => columns.filter((c) => c.behavior === 'default-inbox').length,
    [columns]
  )

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks
    const q = search.toLowerCase()
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q) ||
        t.cwd.toLowerCase().includes(q)
    )
  }, [tasks, search])

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, BoardTask[]>()
    for (const col of columns) {
      map.set(col.id, [])
    }
    for (const task of filteredTasks) {
      const arr = map.get(task.columnId)
      if (arr) arr.push(task)
    }
    return map
  }, [columns, filteredTasks])

  const handleAddTask = useCallback((columnId: string) => {
    setEditTask(null)
    setFormColumnId(columnId)
    setFormOpen(true)
  }, [])

  const handleEditTask = useCallback((task: BoardTask) => {
    setEditTask(task)
    setFormColumnId(undefined)
    setFormOpen(true)
  }, [])

  const handleCloseForm = useCallback(() => {
    setFormOpen(false)
    setEditTask(null)
    setFormColumnId(undefined)
  }, [])

  const handleClickTask = useCallback((task: BoardTask) => {
    const current = useBoardStore.getState().tasks.find((t) => t.id === task.id)
    setDetailTask(current ?? task)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setDetailTask(null)
  }, [])

  const handleContextMenuTask = useCallback(
    (e: React.MouseEvent, task: BoardTask) => {
      e.preventDefault()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Edit', onClick: () => handleEditTask(task) },
          { label: 'Delete', onClick: () => deleteTask(task.id), danger: true }
        ]
      })
    },
    [handleEditTask, deleteTask]
  )

  const runTask = useCallback(
    async (task: BoardTask) => {
      if (!task.prompt.trim()) {
        const current = useBoardStore.getState().tasks.find((t) => t.id === task.id)
        setDetailTask(current ?? task)
        return
      }

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

      const activeCol = getColumnByBehavior('active')
      if (activeCol) {
        moveTask(task.id, activeCol.id, 0)
      }
      updateTask(task.id, { sessionId: sessionInfo.id })

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
    [addSession, moveTask, updateTask, getColumnByBehavior]
  )

  const handleAddNewColumn = useCallback(() => {
    addColumn('New Column')
  }, [addColumn])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-0">
      {/* Top bar: search */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle flex-shrink-0">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full h-7 pl-8 pr-3 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
          />
        </div>
      </div>

      {/* Board: horizontal scrolling columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full items-start">
          {sortedColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn.get(column.id) ?? []}
              onAddTask={handleAddTask}
              onRunTask={runTask}
              onClickTask={handleClickTask}
              onContextMenuTask={handleContextMenuTask}
              onRenameColumn={(id, title) => updateColumn(id, { title })}
              onDeleteColumn={deleteColumn}
              onAddColumnAfter={(id) => addColumn('New Column', id)}
              isOnlyInbox={inboxColumnCount <= 1}
              draggingTaskId={draggingTaskId}
              dropTarget={dropTarget}
              onPointerDown={onPointerDown}
            />
          ))}

          {/* Add column button */}
          <button
            onClick={handleAddNewColumn}
            className="w-72 flex-shrink-0 h-12 rounded-xl border-2 border-dashed border-border-subtle hover:border-border text-text-tertiary hover:text-text-secondary flex items-center justify-center gap-2 text-sm transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Column
          </button>
        </div>
      </div>

      <TaskForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        columnId={formColumnId}
        editTask={editTask}
      />

      <TaskDetailPanel task={detailTask} onClose={handleCloseDetail} />

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
