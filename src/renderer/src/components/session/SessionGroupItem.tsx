import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSessionStore, type SessionGroup } from '../../store/session-store'

interface SessionGroupItemProps {
  group: SessionGroup
  onClick: (shiftKey: boolean) => void
  onContextMenu: (e: React.MouseEvent) => void
  allSelected?: boolean
  forceEditing?: boolean
  onEditingDone?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  dropIndicator?: 'before' | 'after' | 'inside' | null
  isDragging?: boolean
}

export function SessionGroupItem({
  group,
  onClick,
  onContextMenu,
  allSelected,
  forceEditing,
  onEditingDone,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dropIndicator,
  isDragging
}: SessionGroupItemProps) {
  const toggleGroupCollapsed = useSessionStore((s) => s.toggleGroupCollapsed)
  const renameGroup = useSessionStore((s) => s.renameGroup)

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(group.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const [prevForceEditing, setPrevForceEditing] = useState(false)

  // Adjust editing state when forceEditing prop changes (render-time pattern)
  if (!!forceEditing !== prevForceEditing) {
    setPrevForceEditing(!!forceEditing)
    if (forceEditing && !editing) {
      setEditValue(group.name)
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
    renameGroup(group.id, editValue)
    setEditing(false)
    onEditingDone?.()
  }, [group.id, editValue, renameGroup, onEditingDone])

  const cancelRename = useCallback(() => {
    setEditValue(group.name)
    setEditing(false)
    onEditingDone?.()
  }, [group.name, onEditingDone])

  const startEditing = useCallback(() => {
    setEditValue(group.name)
    setEditing(true)
  }, [group.name])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      startEditing()
    },
    [startEditing]
  )

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      toggleGroupCollapsed(group.id)
    },
    [group.id, toggleGroupCollapsed]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(e.shiftKey)
    },
    [onClick]
  )

  const handleKeyDown = useCallback(
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
      {dropIndicator === 'inside' && (
        <div className="absolute inset-0 rounded-lg border-2 border-accent pointer-events-none z-10" />
      )}
      <button
        onClick={handleClick}
        onContextMenu={onContextMenu}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1 rounded-lg text-left transition-colors outline-none',
          allSelected ? 'text-text-primary' : 'text-text-secondary hover:bg-surface-100',
          isDragging && 'opacity-30'
        )}
      >
        {/* Disclosure triangle */}
        <span
          onClick={handleToggleCollapse}
          className="flex-shrink-0 w-3 h-3 flex items-center justify-center text-text-tertiary cursor-pointer"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="currentColor"
            className={cn('transition-transform', group.collapsed ? '' : 'rotate-90')}
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
        </span>

        {/* Folder icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="flex-shrink-0 text-text-tertiary"
        >
          <path
            d="M1.5 3.5a1 1 0 011-1h3l1.5 1.5h4.5a1 1 0 011 1v5a1 1 0 01-1 1h-9a1 1 0 01-1-1v-6.5z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>

        {/* Group name */}
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
            {group.name}
          </span>
        )}

        {/* Session count badge */}
        <span className="flex-shrink-0 text-[10px] text-text-tertiary bg-surface-100 px-1.5 py-0.5 rounded-full">
          {group.sessionIds.length}
        </span>
      </button>
      {dropIndicator === 'after' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full z-10" />
      )}
    </div>
  )
}
