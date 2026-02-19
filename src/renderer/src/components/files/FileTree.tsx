import { useState, useCallback } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useFileTree, type FlatTreeNode } from '../../hooks/use-file-tree'
import { FileTreeItem } from './FileTreeItem'
import { ContextMenu } from '../ui/ContextMenu'
import { shellEscape } from '../../lib/shell'

interface ContextMenuState {
  x: number
  y: number
  items: { label: string; onClick: () => void; shortcut?: string }[]
}

export function FileTree({ cwd, isCustom, onChangeFolder, onResetFolder, onNavigateToFolder }: {
  cwd: string | null
  isCustom: boolean
  onChangeFolder: () => void
  onResetFolder: () => void
  onNavigateToFolder: (absolutePath: string) => void
}) {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const setPreviewFile = useSessionStore((s) => s.setPreviewFile)

  const { flatList, loading, filter, setFilter, toggleDir } = useFileTree(cwd)

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const handleClickFile = useCallback(
    (filePath: string, metaKey: boolean) => {
      if (!focusedSessionId || !cwd) return

      if (metaKey) {
        setSelectedPaths((prev) => {
          const next = new Set(prev)
          if (next.has(filePath)) {
            next.delete(filePath)
          } else {
            next.add(filePath)
          }
          return next
        })
      } else {
        setSelectedPaths(new Set())
      }
    },
    [focusedSessionId, cwd]
  )

  const handleDoubleClickFile = useCallback(
    (filePath: string) => {
      setPreviewFile(filePath, 'tree', cwd)
    },
    [setPreviewFile, cwd]
  )

  const handleDoubleClickDir = useCallback(
    (dirPath: string) => {
      if (!cwd) return
      onNavigateToFolder(`${cwd}/${dirPath}`)
    },
    [cwd, onNavigateToFolder]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: FlatTreeNode) => {
      if (!cwd) return
      if (selectedPaths.size > 1 && selectedPaths.has(node.path)) {
        const paths = Array.from(selectedPaths)
          .map((p) => `${cwd}/${p}`)
          .map((p) => shellEscape(p))
          .join(' ')
        e.dataTransfer.setData('text/plain', paths)
      } else {
        e.dataTransfer.setData('text/plain', `${cwd}/${node.path}`)
      }
      e.dataTransfer.effectAllowed = 'copy'
    },
    [cwd, selectedPaths]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FlatTreeNode) => {
      if (!cwd) return
      const absPath = `${cwd}/${node.path}`
      const items = [
        {
          label: 'Copy Relative Path',
          onClick: () => navigator.clipboard.writeText(`./${node.path}`)
        },
        {
          label: 'Copy Absolute Path',
          onClick: () => navigator.clipboard.writeText(absPath)
        },
        {
          label: 'Reveal in Finder',
          onClick: () => { window.electronAPI?.showItemInFolder(absPath) }
        }
      ]
      if (node.type === 'file') {
        items.unshift({
          label: 'Preview',
          onClick: () => setPreviewFile(node.path, 'tree', cwd)
        })
      }
      if (node.type === 'directory') {
        items.unshift({
          label: 'Open as Root',
          onClick: () => onNavigateToFolder(absPath)
        })
      }
      setContextMenu({ x: e.clientX, y: e.clientY, items })
    },
    [cwd, setPreviewFile, onNavigateToFolder]
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filter input + folder actions */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border-subtle flex-shrink-0">
        <input
          type="text"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 h-6 px-2 rounded bg-surface-100 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors min-w-0"
        />
        {isCustom && (
          <button
            onClick={onResetFolder}
            className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
            title="Reset to session folder"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6a4 4 0 0 1 7.2-2.4M10 6a4 4 0 0 1-7.2 2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M9.5 1.5v2.5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 10.5V8H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <button
          onClick={onChangeFolder}
          className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
          title="Browse another folder"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M1 3C1 2.45 1.45 2 2 2H4.5L6 3.5H10C10.55 3.5 11 3.95 11 4.5V9C11 9.55 10.55 10 10 10H2C1.45 10 1 9.55 1 9V3Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto">
        {!cwd ? (
          <div className="px-3 py-8 text-center text-xs text-text-tertiary">
            Focus a session to browse files
          </div>
        ) : loading ? (
          <div className="px-3 py-8 text-center text-xs text-text-tertiary">Loading...</div>
        ) : flatList.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-text-tertiary">
            {filter ? 'No matching files' : 'Empty directory'}
          </div>
        ) : (
          flatList.map((node) => (
            <FileTreeItem
              key={node.path}
              node={node}
              isSelected={selectedPaths.has(node.path)}
              onClickFile={handleClickFile}
              onDoubleClickFile={handleDoubleClickFile}
              onDoubleClickDir={handleDoubleClickDir}
              onToggleDir={toggleDir}
              onContextMenu={handleContextMenu}
              onDragStart={handleDragStart}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
