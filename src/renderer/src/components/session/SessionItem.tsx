import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSessionStore, type Session } from '../../store/session-store'
import { useLocationStore } from '../../store/location-store'
import { CommandLineIcon, XMarkIcon, BoltIcon, GlobeAltIcon, SparklesIcon, FireIcon } from '@heroicons/react/24/outline'

function LocationBadge({ locationId }: { locationId: string }) {
  const location = useLocationStore((s) => s.locations.find((l) => l.id === locationId))
  if (!location || location.type !== 'remote') return null
  return (
    <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-text-tertiary bg-surface-100 truncate max-w-[60px]">
      {location.name}
    </span>
  )
}

interface SessionItemProps {
  session: Session
  isSelected: boolean
  onClick: (modifiers: { metaKey: boolean; shiftKey: boolean }) => void
  onContextMenu: (e: React.MouseEvent) => void
  grouped?: boolean
  groupSelected?: boolean
  groupColorHex?: string
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
  groupColorHex,
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
          'group w-full flex items-center gap-2.5 py-1.5 rounded-lg text-left transition-all outline-none',
          grouped ? 'pl-1 pr-2' : 'px-2.5',
          groupSelected
            ? 'text-text-primary'
            : isSelected
              ? grouped
                ? 'text-text-primary'
                : 'bg-surface-200 text-text-primary shadow-[0_0_0.5px_rgba(0,0,0,0.12)]'
              : groupColorHex
                ? 'text-text-secondary'
                : 'text-text-secondary hover:bg-surface-100',
          isDragging && 'opacity-30'
        )}
        style={groupColorHex && isSelected && !groupSelected && grouped
          ? { backgroundColor: `${groupColorHex}20` }
          : undefined
        }
        onMouseEnter={(e) => {
          if (groupColorHex && !isSelected && !groupSelected) {
            e.currentTarget.style.backgroundColor = `${groupColorHex}18`
          }
        }}
        onMouseLeave={(e) => {
          if (groupColorHex && !isSelected && !groupSelected) {
            e.currentTarget.style.backgroundColor = ''
          }
        }}
      >
        {/* Session icon with status badge */}
        <span className="relative flex-shrink-0 w-4 h-4">
          {session.sessionType === 'agent' ? (
            <BoltIcon className={cn('w-4 h-4 transition-colors duration-300', session.hasUnseenActivity ? 'text-accent' : 'text-text-tertiary')} />
          ) : session.sessionType === 'remote-terminal' || session.sessionType === 'remote-claude' ? (
            <GlobeAltIcon className={cn('w-4 h-4 transition-colors duration-300', session.hasUnseenActivity ? 'text-accent' : 'text-text-tertiary')} />
          ) : session.dangerousMode ? (
            <FireIcon className={cn('w-4 h-4 transition-colors duration-300', session.hasUnseenActivity ? 'text-accent' : 'text-text-tertiary')} />
          ) : session.claudeMode ? (
            <SparklesIcon className={cn('w-4 h-4 transition-colors duration-300', session.hasUnseenActivity ? 'text-accent' : 'text-text-tertiary')} />
          ) : (
            <CommandLineIcon className={cn('w-4 h-4 transition-colors duration-300', session.hasUnseenActivity ? 'text-accent' : 'text-text-tertiary')} />
          )}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-50',
              session.activityStatus === 'active' && 'bg-status-working',
              session.activityStatus === 'idle' && 'bg-status-ready',
              session.activityStatus === 'ended' && 'bg-status-inactive'
            )}
            style={session.activityStatus === 'active' ? { animation: 'pulse-dot 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : undefined}
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
            className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-text-primary outline-none border-none"
          />
        ) : (
          <span className="flex-1 min-w-0 text-[13px] font-medium truncate" onDoubleClick={handleDoubleClick}>
            {session.name}
          </span>
        )}

        {/* Location badge for remote/agent sessions */}
        {session.locationId && session.sessionType !== 'local' && (
          <LocationBadge locationId={session.locationId} />
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
