import { useSessionStore, type FileTab } from '../../store/session-store'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { CodeBracketSquareIcon } from '@heroicons/react/24/outline'
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
  onPointerDown?: (e: React.PointerEvent) => void
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
  onPointerDown,
  isDragging
}: FileTabItemProps) {
  const renameFileTab = useSessionStore((s) => s.renameFileTab)
  const removeFileTab = useSessionStore((s) => s.removeFileTab)

  const isDiff = fileTab.kind === 'diff'
  const titleSuffix = isDiff
    ? fileTab.diff?.type === 'commit'
      ? ` (diff @ ${fileTab.diff.hash?.slice(0, 7) ?? 'commit'})`
      : fileTab.diff?.staged
        ? ' (staged diff)'
        : ' (diff)'
    : ''

  return (
    <SidebarTabItem
      id={fileTab.id}
      name={fileTab.name}
      title={`${fileTab.filePath.replace(/^\/Users\/[^/]+/, '~')}${titleSuffix}`}
      isSelected={isSelected}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onRename={renameFileTab}
      onDelete={() => removeFileTab(fileTab.id)}
      icon={
        <span className="flex-shrink-0 w-4 h-4">
          {isDiff ? (
            <CodeBracketSquareIcon className="w-4 h-4 text-text-tertiary" />
          ) : (
            <DocumentTextIcon className="w-4 h-4 text-text-tertiary" />
          )}
        </span>
      }
      grouped={grouped}
      groupSelected={groupSelected}
      forceEditing={forceEditing}
      onEditingDone={onEditingDone}
      onPointerDown={onPointerDown}
      isDragging={isDragging}
    />
  )
}
