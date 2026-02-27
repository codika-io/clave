import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSessionStore, type Session } from '../../store/session-store'
import { CommandLineIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface SessionItemProps {
  session: Session
  isSelected: boolean
  onClick: (modifiers: { metaKey: boolean; shiftKey: boolean }) => void
  onContextMenu: (e: React.MouseEvent) => void
  grouped?: boolean
  groupSelected?: boolean
  forceEditing?: boolean
  onEditingDone?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  dropIndicator?: 'before' | 'after' | null
  isDragging?: boolean
  onDelete?: () => void
}

export function SessionItem({
  session,
  isSelected,
  onClick,
  onContextMenu,
  grouped,
  groupSelected,
  forceEditing,
  onEditingDone,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dropIndicator,
  isDragging,
  onDelete
}: SessionItemProps) {
  const renameSession = useSessionStore((s) => s.renameSession)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(session.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const [prevForceEditing, setPrevForceEditing] = useState(false)

  // Adjust editing state when forceEditing prop changes (render-time pattern)
  if (!!forceEditing !== prevForceEditing) {
    setPrevForceEditing(!!forceEditing)
    if (forceEditing && !editing) {
      setEditValue(session.name)
      setEditing(true)
    }
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commitRename = useCallback(() => {
    renameSession(session.id, editValue)
    setEditing(false)
    onEditingDone?.()
  }, [session.id, editValue, renameSession, onEditingDone])

  const cancelRename = useCallback(() => {
    setEditValue(session.name)
    setEditing(false)
    onEditingDone?.()
  }, [session.name, onEditingDone])

  const startEditing = useCallback(() => {
    setEditValue(session.name)
    setEditing(true)
  }, [session.name])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      startEditing()
    },
    [startEditing]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick({ metaKey: e.metaKey, shiftKey: e.shiftKey })
    },
    [onClick]
  )

  const handleButtonKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !editing) {
        e.preventDefault()
        startEditing()
      }
    },
    [editing, startEditing]
  )

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitRename()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelRename()
      }
    },
    [commitRename, cancelRename]
  )

  return (
    <div
      className="relative"
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {dropIndicator === 'before' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-accent rounded-full z-10" />
      )}
      <button
        onClick={handleClick}
        onContextMenu={onContextMenu}
        onKeyDown={handleButtonKeyDown}
        title={session.cwd.replace(/^\/Users\/[^/]+/, '~')}
        className={cn(
          'group w-full flex items-center gap-3 py-2.5 rounded-lg text-left transition-all outline-none',
          grouped ? 'pl-4 pr-2' : 'px-3',
          groupSelected
            ? 'text-text-primary'
            : isSelected
              ? grouped
                ? 'bg-surface-200/80 text-text-primary'
                : 'bg-surface-200 text-text-primary shadow-[0_0_0.5px_rgba(0,0,0,0.12)]'
              : 'text-text-secondary hover:bg-surface-100',
          isDragging && 'opacity-30'
        )}
      >
        {/* Terminal icon with status badge */}
        <span className="relative flex-shrink-0 w-5 h-5">
          <CommandLineIcon className="w-5 h-5 text-text-tertiary" />
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-50',
              session.activityStatus === 'active' && 'bg-status-working',
              session.activityStatus === 'idle' && session.promptWaiting && 'bg-status-waiting',
              session.activityStatus === 'idle' && !session.promptWaiting && 'bg-status-ready',
              session.activityStatus === 'ended' && 'bg-status-inactive'
            )}
            style={session.activityStatus === 'active' ? { animation: 'pulse-dot 1.5s ease-in-out infinite' } : undefined}
          />
        </span>

        {/* Session name — double-click to rename */}
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleInputKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none border-none"
          />
        ) : (
          <span className="flex-1 min-w-0 text-sm font-medium truncate" onDoubleClick={handleDoubleClick}>
            {session.name}
          </span>
        )}

        {/* Close button — visible on hover */}
        {!editing && onDelete && !isDragging && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity text-text-tertiary hover:text-text-primary"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </span>
        )}
      </button>
      {dropIndicator === 'after' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full z-10" />
      )}
    </div>
  )
}
