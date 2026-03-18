import { useSessionStore, type FileTab } from '../../store/session-store'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { SidebarTabItem } from './SidebarTabItem'

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

  return (
    <SidebarTabItem
      id={fileTab.id}
      name={fileTab.name}
      title={fileTab.filePath.replace(/^\/Users\/[^/]+/, '~')}
      isSelected={isSelected}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onRename={renameFileTab}
      onDelete={() => removeFileTab(fileTab.id)}
      icon={
        <span className="flex-shrink-0 w-4 h-4">
          <DocumentTextIcon className="w-4 h-4 text-text-tertiary" />
        </span>
      }
      grouped={grouped}
      groupSelected={groupSelected}
      forceEditing={forceEditing}
      onEditingDone={onEditingDone}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      dropIndicator={dropIndicator}
      isDragging={isDragging}
    />
  )
}
