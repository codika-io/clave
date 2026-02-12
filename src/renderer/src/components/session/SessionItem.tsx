import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSessionStore, type Session } from '../../store/session-store'

interface SessionItemProps {
  session: Session
  isActive: boolean
  onClick: () => void
}

export function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  const renameSession = useSessionStore((s) => s.renameSession)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(session.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commitRename = useCallback(() => {
    renameSession(session.id, editValue)
    setEditing(false)
  }, [session.id, editValue, renameSession])

  const cancelRename = useCallback(() => {
    setEditValue(session.name)
    setEditing(false)
  }, [session.name])

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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startEditing()
    },
    [startEditing]
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
    <button
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleButtonKeyDown}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors',
        isActive ? 'bg-surface-200 text-text-primary' : 'text-text-secondary hover:bg-surface-100'
      )}
    >
      {/* Terminal icon with status badge */}
      <span className="relative flex-shrink-0 w-4 h-4">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-tertiary">
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
  )
}
