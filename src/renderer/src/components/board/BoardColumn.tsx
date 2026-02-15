import { useCallback, useRef, useState } from 'react'
import { TaskCard } from './TaskCard'
import { cn } from '../../lib/utils'
import type { BoardTask } from '../../../../preload/index.d'

interface BoardColumnProps {
  title: string
  status: BoardTask['status']
  tasks: BoardTask[]
  onEdit: (task: BoardTask) => void
  onStart?: (task: BoardTask) => void
  onSaveAsTemplate?: (task: BoardTask) => void
  onNewTask?: () => void
  onReorder: (taskId: string, newOrder: number, newStatus: BoardTask['status']) => void
}

export function BoardColumn({
  title,
  status,
  tasks,
  onEdit,
  onStart,
  onSaveAsTemplate,
  onNewTask,
  onReorder
}: BoardColumnProps) {
  const sorted = [...tasks].sort((a, b) => a.order - b.order)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const [columnDragOver, setColumnDragOver] = useState(false)
  const dragIdRef = useRef<string | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    dragIdRef.current = taskId
    setDraggingId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (dragIdRef.current === targetId) return

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const position = y < rect.height / 2 ? 'before' : 'after'
    setDropTarget({ id: targetId, position })
  }, [])

  const handleColumnDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setColumnDragOver(true)
  }, [])

  const handleColumnDragLeave = useCallback(() => {
    setColumnDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const taskId = e.dataTransfer.getData('text/plain')
      if (!taskId) return

      if (dropTarget) {
        const targetIdx = sorted.findIndex((t) => t.id === dropTarget.id)
        const targetTask = sorted[targetIdx]
        if (targetTask) {
          const newOrder =
            dropTarget.position === 'before'
              ? targetTask.order - 0.5
              : targetTask.order + 0.5
          onReorder(taskId, newOrder, status)
        }
      } else {
        // Dropped on empty column area
        const maxOrder = sorted.length > 0 ? sorted[sorted.length - 1].order + 1 : 0
        onReorder(taskId, maxOrder, status)
      }

      setDraggingId(null)
      setDropTarget(null)
      setColumnDragOver(false)
      dragIdRef.current = null
    },
    [dropTarget, sorted, onReorder, status]
  )

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropTarget(null)
    setColumnDragOver(false)
    dragIdRef.current = null
  }, [])

  const statusColors: Record<string, string> = {
    todo: 'bg-text-tertiary',
    processing: 'bg-green-500',
    done: 'bg-blue-500'
  }

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-w-[280px] max-w-[400px] rounded-xl bg-surface-50 border border-border-subtle',
        columnDragOver && 'ring-2 ring-accent/40'
      )}
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
        <div className={cn('w-2 h-2 rounded-full', statusColors[status])} />
        <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[11px] text-text-tertiary font-medium ml-1">
          {tasks.length}
        </span>
        {onNewTask && (
          <button
            onClick={onNewTask}
            className="ml-auto p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-200 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sorted.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onEdit={onEdit}
            onStart={onStart}
            onSaveAsTemplate={onSaveAsTemplate}
            onDragStart={(e) => handleDragStart(e, task.id)}
            onDragOver={(e) => handleDragOver(e, task.id)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            dropIndicator={
              dropTarget?.id === task.id ? dropTarget.position : null
            }
            isDragging={draggingId === task.id}
          />
        ))}

        {sorted.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-text-tertiary">
            No tasks
          </div>
        )}
      </div>

    </div>
  )
}
