import { useCallback } from 'react'
import { cn } from '../../lib/utils'
import {
  useSessionStore,
  type SessionGroup,
  TERMINAL_COLOR_VALUES,
  resolveColorHex
} from '../../store/session-store'
import {
  ChevronRightIcon,
  CommandLineIcon,
  PlusIcon
} from '@heroicons/react/24/outline'
import { useInlineEdit } from '../../hooks/use-inline-edit'

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

  const {
    editing,
    editValue,
    inputRef,
    setEditValue,
    handleDoubleClick,
    handleButtonKeyDown,
    handleInputKeyDown,
    commitRename
  } = useInlineEdit({
    name: group.name,
    onCommit: (newName) => renameGroup(group.id, newName),
    onEditingDone,
    forceEditing
  })

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
          'group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors outline-none',
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

        {/* Group name */}
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
          <span
            className="flex-1 min-w-0 text-[13px] font-medium truncate"
            onDoubleClick={handleDoubleClick}
          >
            {group.name}
          </span>
        )}

        {/* Terminal icons */}
        <div className={cn('flex items-center gap-0 flex-shrink-0', editing && 'invisible')}>
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
              const colorHex = resolveColorHex(t.color) ?? TERMINAL_COLOR_VALUES['blue']
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
      </button>
      {dropIndicator === 'after' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full z-10" />
      )}
    </div>
  )
}
