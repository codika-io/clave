import { useState, useCallback, useRef, useEffect } from 'react'
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

interface InlineCreateState {
  parentPath: string // '.' for root
  type: 'file' | 'directory'
}

function InlineCreateInput({
  state,
  cwd,
  depth,
  onCreated,
  onCancel
}: {
  state: InlineCreateState
  cwd: string
  depth: number
  onCreated: (path: string, type: 'file' | 'directory') => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = useCallback(async () => {
    const name = value.trim()
    if (!name) {
      onCancel()
      return
    }

    // Basic validation
    if (name.includes('/') || name.includes('\\')) {
      setError('Invalid name')
      return
    }

    const relativePath = state.parentPath === '.' ? name : `${state.parentPath}/${name}`

    try {
      if (state.type === 'file') {
        await window.electronAPI?.createFile(cwd, relativePath)
      } else {
        await window.electronAPI?.createDirectory(cwd, relativePath)
      }
      onCreated(relativePath, state.type)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    }
  }, [value, state, cwd, onCreated, onCancel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [submit, onCancel]
  )

  return (
    <div
      className="flex items-center h-7 px-2"
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <span className="w-4 flex-shrink-0" />
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className="flex-shrink-0 text-text-tertiary ml-0.5 mr-1.5"
      >
        {state.type === 'file' ? (
          <path
            d="M3 1.5H8.5L11 4V12.5H3V1.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H5L6.5 4H11.5C12.05 4 12.5 4.45 12.5 5V10.5C12.5 11.05 12.05 11.5 11.5 11.5H2.5C1.95 11.5 1.5 11.05 1.5 10.5V3.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <div className="flex-1 min-w-0 flex flex-col">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          onBlur={submit}
          placeholder={state.type === 'file' ? 'filename' : 'folder name'}
          className={`w-full h-5 px-1.5 rounded text-xs font-mono bg-surface-100 text-text-primary placeholder:text-text-tertiary outline-none border ${
            error ? 'border-red-400' : 'border-accent'
          }`}
        />
        {error && (
          <span className="text-[10px] text-red-400 mt-0.5">{error}</span>
        )}
      </div>
    </div>
  )
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

  const { flatList, loading, filter, setFilter, toggleDir, refreshDir } = useFileTree(cwd)

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [inlineCreate, setInlineCreate] = useState<InlineCreateState | null>(null)

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

  const handleInlineCreated = useCallback(
    async (relativePath: string, type: 'file' | 'directory') => {
      if (!cwd || !inlineCreate) return
      const parentPath = inlineCreate.parentPath
      setInlineCreate(null)
      // Refresh the parent directory in the tree
      await refreshDir(parentPath)
      // If a file was created, open it in edit-mode preview
      if (type === 'file') {
        setPreviewFile(relativePath, 'tree', cwd)
      }
    },
    [cwd, inlineCreate, refreshDir, setPreviewFile]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FlatTreeNode) => {
      if (!cwd) return
      const absPath = `${cwd}/${node.path}`
      const items: { label: string; onClick: () => void; shortcut?: string }[] = []

      if (node.type === 'file') {
        items.push({
          label: 'Preview',
          onClick: () => setPreviewFile(node.path, 'tree', cwd)
        })
        items.push({
          label: 'Edit',
          onClick: () => setPreviewFile(node.path, 'tree', cwd)
        })
      }
      if (node.type === 'directory') {
        items.push({
          label: 'Open as Root',
          onClick: () => onNavigateToFolder(absPath)
        })
        items.push({
          label: 'New File...',
          onClick: () => setInlineCreate({ parentPath: node.path, type: 'file' })
        })
        items.push({
          label: 'New Folder...',
          onClick: () => setInlineCreate({ parentPath: node.path, type: 'directory' })
        })
      }
      items.push({
        label: 'Copy Relative Path',
        onClick: () => navigator.clipboard.writeText(`./${node.path}`)
      })
      items.push({
        label: 'Copy Absolute Path',
        onClick: () => navigator.clipboard.writeText(absPath)
      })
      items.push({
        label: 'Reveal in Finder',
        onClick: () => { window.electronAPI?.showItemInFolder(absPath) }
      })
      setContextMenu({ x: e.clientX, y: e.clientY, items })
    },
    [cwd, setPreviewFile, onNavigateToFolder]
  )

  // Context menu on empty area — allow creating at root
  const handleEmptyContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!cwd) return
      // Only if right-clicking the empty space (not on an item)
      if ((e.target as HTMLElement).closest('[data-tree-item]')) return
      e.preventDefault()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: 'New File...',
            onClick: () => setInlineCreate({ parentPath: '.', type: 'file' })
          },
          {
            label: 'New Folder...',
            onClick: () => setInlineCreate({ parentPath: '.', type: 'directory' })
          }
        ]
      })
    },
    [cwd]
  )

  // Build flat list with inline create input inserted at the right position
  const renderList = useCallback(() => {
    const elements: React.ReactNode[] = []

    for (const node of flatList) {
      elements.push(
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
      )

      // If this is the directory where we're creating, insert inline input after it
      if (inlineCreate && node.type === 'directory' && node.path === inlineCreate.parentPath && node.expanded) {
        elements.push(
          <InlineCreateInput
            key="__inline-create__"
            state={inlineCreate}
            cwd={cwd!}
            depth={node.depth + 1}
            onCreated={handleInlineCreated}
            onCancel={() => setInlineCreate(null)}
          />
        )
      }
    }

    // Inline create at root level
    if (inlineCreate && inlineCreate.parentPath === '.') {
      elements.unshift(
        <InlineCreateInput
          key="__inline-create__"
          state={inlineCreate}
          cwd={cwd!}
          depth={0}
          onCreated={handleInlineCreated}
          onCancel={() => setInlineCreate(null)}
        />
      )
    }

    return elements
  }, [flatList, inlineCreate, cwd, selectedPaths, handleClickFile, handleDoubleClickFile, handleDoubleClickDir, toggleDir, handleContextMenu, handleDragStart, handleInlineCreated])

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
      <div
        className="flex-1 overflow-y-auto"
        onContextMenu={handleEmptyContextMenu}
      >
        {!cwd ? (
          <div className="px-3 py-8 text-center text-xs text-text-tertiary">
            Focus a session to browse files
          </div>
        ) : loading ? (
          <div className="px-3 py-8 text-center text-xs text-text-tertiary">Loading...</div>
        ) : flatList.length === 0 && !inlineCreate ? (
          <div className="px-3 py-8 text-center text-xs text-text-tertiary">
            {filter ? 'No matching files' : 'Empty directory'}
          </div>
        ) : (
          renderList()
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
