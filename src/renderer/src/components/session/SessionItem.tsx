import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSessionStore, type Session } from '../../store/session-store'

interface SessionItemProps {
  session: Session
  isSelected: boolean
  onClick: (shiftKey: boolean) => void
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
  isDragging
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
      onClick(e.shiftKey)
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
        className={cn(
          'w-full flex items-center gap-2.5 py-1.5 rounded-lg text-left transition-colors outline-none',
          grouped ? 'pl-7 pr-3' : 'px-3',
          groupSelected
            ? 'text-text-primary'
            : isSelected
              ? 'bg-surface-200 text-text-primary'
              : 'text-text-secondary hover:bg-surface-100',
          isDragging && 'opacity-30'
        )}
      >
        {/* Terminal icon with status badge */}
        <span className="relative flex-shrink-0 w-4 h-4">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-text-tertiary"
          >
            <rect
              x="1.5"
              y="2.5"
              width="13"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M4.5 6l2.5 2-2.5 2"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M8.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-50',
              session.alive ? 'bg-status-active' : 'bg-status-inactive'
            )}
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
          <span
            className="flex-1 min-w-0 text-sm font-medium truncate"
            onDoubleClick={handleDoubleClick}
          >
            {session.name}
          </span>
        )}
      </button>
      {dropIndicator === 'after' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full z-10" />
      )}
    </div>
  )
}
