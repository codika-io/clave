import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSessionStore, type FileTab } from '../../store/session-store'
import { DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface FileTabItemProps {
  fileTab: FileTab
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
}

export function FileTabItem({
  fileTab,
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
}: FileTabItemProps) {
  const renameFileTab = useSessionStore((s) => s.renameFileTab)
  const removeFileTab = useSessionStore((s) => s.removeFileTab)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(fileTab.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const [prevForceEditing, setPrevForceEditing] = useState(false)

  if (!!forceEditing !== prevForceEditing) {
    setPrevForceEditing(!!forceEditing)
    if (forceEditing && !editing) {
      setEditValue(fileTab.name)
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
    renameFileTab(fileTab.id, editValue)
    setEditing(false)
    onEditingDone?.()
  }, [fileTab.id, editValue, renameFileTab, onEditingDone])

  const cancelRename = useCallback(() => {
    setEditValue(fileTab.name)
    setEditing(false)
    onEditingDone?.()
  }, [fileTab.name, onEditingDone])

  const startEditing = useCallback(() => {
    setEditValue(fileTab.name)
    setEditing(true)
  }, [fileTab.name])

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
        title={fileTab.filePath.replace(/^\/Users\/[^/]+/, '~')}
        className={cn(
          'group w-full flex items-center gap-2.5 py-1.5 rounded-lg text-left transition-all outline-none',
          grouped ? 'pl-4 pr-2' : 'px-2.5',
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
        {/* Document icon */}
        <span className="flex-shrink-0 w-4 h-4">
          <DocumentTextIcon className="w-4 h-4 text-text-tertiary" />
        </span>

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
            {fileTab.name}
          </span>
        )}

        {/* Close button */}
        {!editing && !isDragging && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              removeFileTab(fileTab.id)
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
