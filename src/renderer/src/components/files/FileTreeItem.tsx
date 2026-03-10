import { useCallback } from 'react'
import { FileIcon } from './file-icons'
import type { FlatTreeNode } from '../../hooks/use-file-tree'

interface FileTreeItemProps {
  node: FlatTreeNode
  isSelected: boolean
  onClickFile: (path: string, metaKey: boolean) => void
  onDoubleClickFile: (path: string) => void
  onDoubleClickDir: (path: string) => void
  onToggleDir: (path: string) => void
  onContextMenu: (e: React.MouseEvent, node: FlatTreeNode) => void
  onDragStart: (e: React.DragEvent, node: FlatTreeNode) => void
}

export function FileTreeItem({
  node,
  isSelected,
  onClickFile,
  onDoubleClickFile,
  onDoubleClickDir,
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

  const handleDoubleClick = useCallback(
    () => {
      if (node.type === 'file') {
        onDoubleClickFile(node.path)
      } else {
        onDoubleClickDir(node.path)
      }
    },
    [node, onDoubleClickFile, onDoubleClickDir]
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

  const cappedDepth = Math.min(node.depth, 4)

  return (
    <div
      data-tree-item
      className={`relative flex items-center h-7 px-2 cursor-pointer select-none transition-colors text-sm ${
        isSelected ? 'bg-surface-200' : 'hover:bg-surface-100'
      } ${node.ignored ? 'opacity-40' : ''}`}
      style={{ paddingLeft: `${8 + cappedDepth * 12}px` }}
      title={node.name}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
    >
      {/* Tree indent guides */}
      {Array.from({ length: cappedDepth }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 bottom-0 w-px bg-border"
          style={{ left: `${8 + i * 12 + 6}px` }}
        />
      ))}

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

      <span className="truncate text-xs">
        <span className="text-text-primary">{node.name}</span>
        {node.type === 'file' && node.path.includes('/') && node.depth === 0 && (
          <span className="text-text-tertiary ml-1.5">{node.path.slice(0, node.path.lastIndexOf('/'))}</span>
        )}
      </span>
    </div>
  )
}
