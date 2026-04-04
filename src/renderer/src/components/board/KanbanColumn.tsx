import { useState, useCallback } from 'react'
import { PlusIcon, EllipsisHorizontalIcon, InboxIcon, PlayIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { KanbanCard } from './KanbanCard'
import { ContextMenu } from '../ui/ContextMenu'
import { cn } from '../../lib/utils'
import type { BoardTask, BoardColumn as BoardColumnType } from '../../../../preload/index.d'

const BEHAVIOR_ICONS: Record<string, typeof InboxIcon> = {
  'default-inbox': InboxIcon,
  'active': PlayIcon,
  'terminal': CheckCircleIcon
}

interface KanbanColumnProps {
  column: BoardColumnType
  tasks: BoardTask[]
  onAddTask: (columnId: string) => void
  onRunTask: (task: BoardTask) => void
  onClickTask: (task: BoardTask) => void
  onContextMenuTask: (e: React.MouseEvent, task: BoardTask) => void
  onRenameColumn: (columnId: string, title: string) => void
  onDeleteColumn: (columnId: string) => void
  onAddColumnAfter: (columnId: string) => void
  isOnlyInbox: boolean
  draggingTaskId?: string | null
  dropTarget?: { columnId: string; order: number } | null
  onPointerDown?: (e: React.PointerEvent, taskId: string, columnId: string) => void
}

export function KanbanColumn({
  column,
  tasks,
  onAddTask,
  onRunTask,
  onClickTask,
  onContextMenuTask,
  onRenameColumn,
  onDeleteColumn,
  onAddColumnAfter,
  isOnlyInbox,
  draggingTaskId,
  dropTarget,
  onPointerDown
}: KanbanColumnProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(column.title)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order)
  const BehaviorIcon = BEHAVIOR_ICONS[column.behavior]
  const canDelete = !column.locked && !(column.behavior === 'default-inbox' && isOnlyInbox)

  const commitRename = useCallback(() => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== column.title) {
      onRenameColumn(column.id, trimmed)
    } else {
      setEditTitle(column.title)
    }
    setIsEditingTitle(false)
  }, [editTitle, column.id, column.title, onRenameColumn])

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div
      data-column-id={column.id}
      className={cn(
        'flex flex-col w-72 flex-shrink-0 rounded-xl bg-surface-50 border border-border-subtle',
        dropTarget?.columnId === column.id && draggingTaskId && 'ring-2 ring-accent/40'
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
        {BehaviorIcon && (
          <BehaviorIcon className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
        )}

        {isEditingTitle ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setEditTitle(column.title)
                setIsEditingTitle(false)
              }
            }}
            className="flex-1 text-sm font-semibold text-text-primary bg-transparent outline-none border-b border-accent"
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold text-text-primary cursor-text truncate"
            onClick={() => {
              setEditTitle(column.title)
              setIsEditingTitle(true)
            }}
          >
            {column.title}
          </span>
        )}

        <span className="text-xs text-text-tertiary tabular-nums">{sortedTasks.length}</span>

        <button
          onClick={handleMenuClick}
          className="p-0.5 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <EllipsisHorizontalIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
        {sortedTasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            column={column}
            onRun={onRunTask}
            onClick={onClickTask}
            onContextMenu={onContextMenuTask}
            isDragging={draggingTaskId === task.id}
            onPointerDown={onPointerDown ? (e) => onPointerDown(e, task.id, column.id) : undefined}
          />
        ))}

        {sortedTasks.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-text-tertiary">
            No tasks
          </div>
        )}
      </div>

      {/* Add task button */}
      <button
        onClick={() => onAddTask(column.id)}
        className="flex items-center gap-1.5 mx-2 mb-2 px-2 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-100 transition-colors"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        Add task
      </button>

      {/* Column context menu */}
      {menuPos && (
        <ContextMenu
          items={[
            {
              label: 'Rename',
              onClick: () => {
                setEditTitle(column.title)
                setIsEditingTitle(true)
              }
            },
            {
              label: 'Add column after',
              onClick: () => onAddColumnAfter(column.id)
            },
            ...(canDelete
              ? [{ label: 'Delete column', onClick: () => onDeleteColumn(column.id), danger: true }]
              : [])
          ]}
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  )
}
