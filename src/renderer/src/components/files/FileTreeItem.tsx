import { useCallback } from 'react'
import { FileIcon } from './file-icons'
import type { FlatTreeNode } from '../../hooks/use-file-tree'

interface FileTreeItemProps {
  node: FlatTreeNode
  isSelected: boolean
  onClickFile: (path: string, metaKey: boolean) => void
  onToggleDir: (path: string) => void
  onContextMenu: (e: React.MouseEvent, node: FlatTreeNode) => void
  onDragStart: (e: React.DragEvent, node: FlatTreeNode) => void
}

export function FileTreeItem({
  node,
  isSelected,
  onClickFile,
  onToggleDir,
  onContextMenu,
  onDragStart
}: FileTreeItemProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (node.type === 'directory') {
        onToggleDir(node.path)
      } else {
        onClickFile(node.path, e.metaKey)
      }
    },
    [node, onClickFile, onToggleDir]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      onDragStart(e, node)
    },
    [node, onDragStart]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      onContextMenu(e, node)
    },
    [node, onContextMenu]
  )

  return (
    <div
      className={`flex items-center h-7 px-2 cursor-pointer select-none transition-colors text-sm ${
        isSelected ? 'bg-surface-200' : 'hover:bg-surface-100'
      }`}
      style={{ paddingLeft: `${8 + node.depth * 16}px` }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
    >
      {/* Chevron for directories */}
      {node.type === 'directory' ? (
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-text-tertiary">
          {node.loading ? (
            <svg width="12" height="12" viewBox="0 0 12 12" className="animate-spin">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="20" strokeDashoffset="10" />
            </svg>
          ) : (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className={`transition-transform duration-100 ${node.expanded ? 'rotate-90' : ''}`}
            >
              <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}

      <FileIcon
        name={node.name}
        isDirectory={node.type === 'directory'}
        className="flex-shrink-0 text-text-tertiary ml-0.5 mr-1.5"
      />

      <span className="truncate text-text-primary text-xs">{node.name}</span>
    </div>
  )
}
