import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import {
  useSessionStore,
  type SessionGroup,
  TERMINAL_COLOR_VALUES
} from '../../store/session-store'
import {
  FolderIcon,
  ChevronRightIcon,
  CommandLineIcon,
  PlusIcon
} from '@heroicons/react/24/outline'

interface SessionGroupItemProps {
  group: SessionGroup
  onClick: (modifiers: { metaKey: boolean; shiftKey: boolean }) => void
  onContextMenu: (e: React.MouseEvent) => void
  onTerminalIconClick: (terminalId: string) => void
  onAddTerminalClick: () => void
  aliveSessionIds: Set<string>
  focusedSessionId: string | null
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
  onTerminalIconClick,
  onAddTerminalClick,
  aliveSessionIds,
  focusedSessionId,
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
      onClick({ metaKey: e.metaKey, shiftKey: e.shiftKey })
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
      <button
        onClick={handleClick}
        onContextMenu={onContextMenu}
        onKeyDown={handleKeyDown}
        className={cn(
          'group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors outline-none',
          allSelected ? 'text-text-primary' : 'text-text-secondary hover:bg-surface-100/50',
          isDragging && 'opacity-30'
        )}
      >
        {/* Disclosure triangle */}
        <span
          onClick={handleToggleCollapse}
          className="flex-shrink-0 w-3 h-3 flex items-center justify-center text-text-tertiary cursor-pointer"
        >
          <ChevronRightIcon
            className={cn('w-3 h-3 transition-transform', group.collapsed ? '' : 'rotate-90')}
          />
        </span>

        {/* Folder icon */}
        <FolderIcon className="flex-shrink-0 w-5 h-5 text-text-tertiary" />

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

        {/* Terminal icons */}
        {!editing && (
          <div className="flex items-center gap-0 flex-shrink-0">
            {/* Add terminal button — on the left */}
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                onAddTerminalClick()
              }}
              className={cn(
                'p-0.5 rounded transition-all text-text-tertiary hover:text-text-secondary',
                group.terminals.length === 0
                  ? ''
                  : 'opacity-0 group-hover:opacity-100'
              )}
              title="Add terminal"
            >
              {group.terminals.length === 0 ? (
                <CommandLineIcon className="w-4 h-4" />
              ) : (
                <PlusIcon className="w-3.5 h-3.5" />
              )}
            </span>
            {/* Configured terminals */}
            {group.terminals.map((t) => {
              const alive = !!t.sessionId && aliveSessionIds.has(t.sessionId)
              const focused = !!t.sessionId && t.sessionId === focusedSessionId
              const colorHex = TERMINAL_COLOR_VALUES[t.color]
              return (
                <span
                  key={t.id}
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onTerminalIconClick(t.id)
                  }}
                  className={cn(
                    'p-1 rounded transition-all',
                    focused && 'bg-surface-200/80'
                  )}
                  style={{ color: colorHex, opacity: alive ? 1 : 0.35 }}
                  title={`${t.command}${alive ? ' (running)' : ''}`}
                >
                  <CommandLineIcon className="w-[18px] h-[18px]" />
                </span>
              )
            })}
          </div>
        )}
      </button>
      {dropIndicator === 'after' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full z-10" />
      )}
    </div>
  )
}
