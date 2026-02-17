import { useCallback, useState } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useBoardStore } from '../../store/board-store'
import { ContextMenu } from '../ui/ContextMenu'
import { cn } from '../../lib/utils'
import type { BoardTask } from '../../../../preload/index.d'

interface TaskCardProps {
  task: BoardTask
  onEdit: (task: BoardTask) => void
  onStart?: (task: BoardTask) => void
  onResume?: (task: BoardTask) => void
  onSaveAsTemplate?: (task: BoardTask) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  dropIndicator: 'before' | 'after' | null
  isDragging: boolean
}

function shortenCwd(cwd: string): string {
  const parts = cwd.split('/')
  if (parts.length <= 3) return cwd
  return '~/' + parts.slice(-2).join('/')
}

export function TaskCard({
  task,
  onEdit,
  onStart,
  onResume,
  onSaveAsTemplate,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dropIndicator,
  isDragging
}: TaskCardProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const selectSession = useSessionStore((s) => s.selectSession)
  const deleteTask = useBoardStore((s) => s.deleteTask)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: { label: string; onClick: () => void; danger?: boolean }[]
  } | null>(null)
  const [hovered, setHovered] = useState(false)

  const linkedSession = task.sessionId ? sessions.find((s) => s.id === task.sessionId) : null

  // A processing task is "disconnected" when it has a claudeSessionId but its linked PTY session is dead or missing
  const isDisconnected =
    task.status === 'processing' &&
    !!task.claudeSessionId &&
    (!linkedSession || !linkedSession.alive)

  // Resumable: task has a claudeSessionId AND is either done, or processing but disconnected
  const isResumable =
    !!task.claudeSessionId &&
    (task.status === 'done' || isDisconnected)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const items: { label: string; onClick: () => void; danger?: boolean }[] = [
        { label: 'Edit', onClick: () => onEdit(task) }
      ]
      if (task.status === 'processing' && linkedSession) {
        items.push({
          label: 'View Session',
          onClick: () => selectSession(linkedSession.id, false)
        })
      }
      if (isResumable && onResume) {
        items.push({ label: 'Resume', onClick: () => onResume(task) })
      }
      if (onSaveAsTemplate) {
        items.push({ label: 'Save as Template', onClick: () => onSaveAsTemplate(task) })
      }
      items.push({ label: 'Delete', onClick: () => deleteTask(task.id), danger: true })
      setContextMenu({ x: e.clientX, y: e.clientY, items })
    },
    [task, linkedSession, isResumable, onEdit, onResume, onSaveAsTemplate, deleteTask, selectSession]
  )

  const handleClick = useCallback(() => {
    if (task.status === 'processing' && linkedSession) {
      selectSession(linkedSession.id, false)
    }
  }, [task.status, linkedSession, selectSession])

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'relative rounded-lg border border-border-subtle bg-surface-100 p-3 transition-all duration-150 group',
          task.status === 'done' && 'opacity-60',
          task.status === 'processing' && 'cursor-pointer',
          isDragging && 'opacity-30',
          dropIndicator === 'before' && 'ring-t-2 ring-accent',
          dropIndicator === 'after' && 'ring-b-2 ring-accent'
        )}
      >
        {dropIndicator === 'before' && (
          <div className="absolute -top-[2px] left-0 right-0 h-[3px] bg-accent rounded-full" />
        )}
        {dropIndicator === 'after' && (
          <div className="absolute -bottom-[2px] left-0 right-0 h-[3px] bg-accent rounded-full" />
        )}

        <div className="flex items-start gap-2">
          {/* Status indicator */}
          <div className="flex-shrink-0">
            {task.status === 'todo' && (
              <div className="w-2 h-2 mt-[6px] rounded-full border-[1.5px] border-text-tertiary" />
            )}
            {task.status === 'processing' && !isDisconnected && (
              <div className="w-2 h-2 mt-[6px] rounded-full bg-green-500 animate-pulse" />
            )}
            {task.status === 'processing' && isDisconnected && (
              <div className="w-2 h-2 mt-[6px] rounded-full bg-yellow-500" />
            )}
            {task.status === 'done' && (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="mt-1 text-green-500">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4.5 7l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">{task.title}</div>
            {task.prompt && (
              <div className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{task.prompt}</div>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-text-tertiary truncate max-w-[180px]" title={task.cwd}>
                {shortenCwd(task.cwd)}
              </span>
              {task.status === 'processing' && linkedSession && (
                <span className="text-[11px] text-green-500 truncate">
                  {linkedSession.name}
                </span>
              )}
            </div>
          </div>

          {/* Start button for todo tasks */}
          {task.status === 'todo' && onStart && hovered && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStart(task)
              }}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-accent/10 hover:bg-accent/20 text-accent transition-colors"
              title="Start task"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor" />
              </svg>
            </button>
          )}

          {/* Resume button */}
          {isResumable && onResume && hovered && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onResume(task)
              }}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 transition-colors"
              title="Resume session"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6a4 4 0 0 1 6.5-3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10 6a4 4 0 0 1-6.5 3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M8 1.5L8.5 2.9L10 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
