import { useCallback, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useInlineEdit } from '../../hooks/use-inline-edit'

export interface SidebarTabItemProps {
  /** Unique identifier for this item */
  id: string
  /** Display name */
  name: string
  /** Tooltip text */
  title?: string
  /** Whether this item is currently selected */
  isSelected: boolean
  onClick: (modifiers: { metaKey: boolean; shiftKey: boolean }) => void
  onContextMenu: (e: React.MouseEvent) => void
  /** Called when the name is committed after editing */
  onRename: (id: string, newName: string) => void
  /** Called when the close button is clicked. If omitted, no close button is shown. */
  onDelete?: () => void

  // Icon slot
  icon: ReactNode
  /** Extra content rendered between the name and the close button (e.g. LocationBadge) */
  extraContent?: ReactNode

  // Group styling
  grouped?: boolean
  groupSelected?: boolean
  /** When set, applies tinted hover/selection backgrounds */
  groupColorHex?: string

  // Inline rename
  forceEditing?: boolean
  onEditingDone?: () => void

  // Drag and drop
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  dropIndicator?: 'before' | 'after' | null
  isDragging?: boolean
}

export function SidebarTabItem({
  id,
  name,
  title,
  isSelected,
  onClick,
  onContextMenu,
  onRename,
  onDelete,
  icon,
  extraContent,
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
  isDragging
}: SidebarTabItemProps) {
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
    name,
    onCommit: (newName) => onRename(id, newName),
    onEditingDone,
    forceEditing
  })

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
        title={title}
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
        {/* Icon */}
        {icon}

        {/* Name — double-click to rename */}
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
            {name}
          </span>
        )}

        {/* Extra content (e.g. location badge) */}
        {extraContent}

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
