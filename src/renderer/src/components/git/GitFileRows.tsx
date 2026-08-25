import { useCallback, useMemo } from 'react'
import { FileIcon } from '../files/file-icons'
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { statusLetter, statusColor, splitPath } from './git-status-utils'
import { buildGitTree, compactTree, flattenGitTree } from '../../lib/git-file-tree'
import type { GitFileStatus } from '../../../../preload/index.d'
import type { FlatGitTreeNode } from '../../lib/git-file-tree'

export function FileRow({
  file,
  cwd,
  isSelected,
  isActiveDiff,
  onClickName,
  onSelect,
  onStageToggle,
  onDiscard,
  onContextMenu,
  disabled,
  selectedPaths,
  indentPx,
  readOnly,
  overlap
}: {
  file: GitFileStatus
  cwd: string
  isSelected?: boolean
  isActiveDiff?: boolean
  onClickName?: (clickY: number) => void
  onSelect?: (path: string, metaKey: boolean) => void
  onStageToggle?: () => void
  onDiscard?: () => void
  onContextMenu?: (file: GitFileStatus, clientX: number, clientY: number) => void
  disabled?: boolean
  selectedPaths?: Set<string>
  /** Left offset in px — sits the row one tree level under its section header (default 12 = px-3). */
  indentPx?: number
  /** Range-section rows (incoming/outgoing): no stage/discard affordances. */
  readOnly?: boolean
  /** The file also has local changes — the conflict heads-up before a pull. */
  overlap?: boolean
}) {
  const { name, dir } = splitPath(file.path)
  const isStaged = file.staged

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.metaKey && onSelect) {
        onSelect(file.path, true)
        return
      }
      onSelect?.(file.path, false)
      onClickName?.(e.clientY)
    },
    [file.path, onClickName, onSelect]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onContextMenu) return
      e.preventDefault()
      onContextMenu(file, e.clientX, e.clientY)
    },
    [file, onContextMenu]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (selectedPaths && selectedPaths.size > 1 && selectedPaths.has(file.path)) {
        const paths = Array.from(selectedPaths)
          .map((p) => `${cwd}/${p}`)
          .join('\n')
        e.dataTransfer.setData('text/plain', paths)
      } else {
        e.dataTransfer.setData('text/plain', `${cwd}/${file.path}`)
      }
      e.dataTransfer.effectAllowed = 'copy'
    },
    [cwd, file.path, selectedPaths]
  )

  return (
    <div
      data-git-row="file"
      className={`flex items-center gap-1.5 pr-3 h-[var(--panel-row-h)] text-xs transition-colors cursor-pointer group ${
        disabled ? 'opacity-50 pointer-events-none' : isActiveDiff ? 'bg-accent/15 border-l-2 border-l-accent' : isSelected ? 'bg-surface-200 border-l-2 border-l-transparent' : 'hover:bg-surface-100 border-l-2 border-l-transparent'
      }`}
      style={{ paddingLeft: indentPx ?? 12 }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
    >
      <span className={`font-mono w-3 flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLetter(file.status)}
      </span>
      <span className="text-text-primary truncate hover:underline">
        {name}
      </span>
      {dir && <span className="text-text-tertiary truncate text-[10px]">{dir}</span>}
      {overlap && (
        <span
          className="text-orange-400 text-[10px] flex-shrink-0"
          title="You also changed this file locally"
        >
          {'\u26a0'}
        </span>
      )}
      {!readOnly && (
        <div className="ml-auto flex-shrink-0 flex items-center gap-0.5">
          <button
            className="btn-icon btn-icon-xs opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onDiscard?.()
            }}
            title="Discard changes"
          >
            <ArrowUturnLeftIcon className="w-3 h-3" />
          </button>
          <button
            className="btn-icon btn-icon-xs opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onStageToggle?.()
            }}
            title={isStaged ? 'Unstage' : 'Stage'}
          >
            {isStaged ? '\u2212' : '+'}
          </button>
        </div>
      )}
    </div>
  )
}

export function GitTreeDirRow({
  node,
  cwd,
  isSelected,
  onToggle,
  onSelect,
  baseIndentPx = 0
}: {
  node: FlatGitTreeNode
  cwd: string
  isSelected?: boolean
  onToggle: (path: string) => void
  onSelect?: (path: string, metaKey: boolean) => void
  baseIndentPx?: number
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.metaKey && onSelect) {
        onSelect(node.path, true)
        return
      }
      onSelect?.(node.path, false)
      onToggle(node.path)
    },
    [node.path, onToggle, onSelect]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', `${cwd}/${node.path}`)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [cwd, node.path]
  )

  return (
    <div
      data-git-row="dir"
      className={`flex items-center gap-1.5 h-[var(--panel-row-h)] text-xs transition-colors cursor-pointer pr-3 ${
        isSelected ? 'bg-surface-200' : 'hover:bg-surface-100'
      }`}
      style={{ paddingLeft: `${baseIndentPx + 8 + node.depth * 8}px` }}
      onClick={handleClick}
      draggable
      onDragStart={handleDragStart}
    >
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-text-tertiary">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform duration-100 ${node.expanded ? 'rotate-90' : ''}`}
        >
          <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <FileIcon name="" isDirectory className="flex-shrink-0 text-text-tertiary" />
      <span className="text-text-secondary truncate">{node.name}</span>
    </div>
  )
}

export function GitTreeFileRow({
  node,
  cwd,
  isSelected,
  isActiveDiff,
  onClickName,
  onSelect,
  onStageToggle,
  onDiscard,
  onContextMenu,
  disabled,
  selectedPaths,
  baseIndentPx = 0,
  readOnly,
  overlap
}: {
  node: FlatGitTreeNode
  cwd: string
  isSelected?: boolean
  isActiveDiff?: boolean
  onClickName?: (clickY: number) => void
  onSelect?: (path: string, metaKey: boolean) => void
  onStageToggle?: () => void
  onDiscard?: () => void
  onContextMenu?: (file: GitFileStatus, clientX: number, clientY: number) => void
  disabled?: boolean
  selectedPaths?: Set<string>
  baseIndentPx?: number
  readOnly?: boolean
  overlap?: boolean
}) {
  const file = node.file!
  const isStaged = file.staged

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.metaKey && onSelect) {
        onSelect(file.path, true)
        return
      }
      onSelect?.(file.path, false)
      onClickName?.(e.clientY)
    },
    [file.path, onClickName, onSelect]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onContextMenu) return
      e.preventDefault()
      onContextMenu(file, e.clientX, e.clientY)
    },
    [file, onContextMenu]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (selectedPaths && selectedPaths.size > 1 && selectedPaths.has(file.path)) {
        const paths = Array.from(selectedPaths)
          .map((p) => `${cwd}/${p}`)
          .join('\n')
        e.dataTransfer.setData('text/plain', paths)
      } else {
        e.dataTransfer.setData('text/plain', `${cwd}/${file.path}`)
      }
      e.dataTransfer.effectAllowed = 'copy'
    },
    [cwd, file.path, selectedPaths]
  )

  return (
    <div
      data-git-row="file"
      className={`flex items-center gap-1.5 h-[var(--panel-row-h)] text-xs transition-colors cursor-pointer group pr-3 ${
        disabled ? 'opacity-50 pointer-events-none' : isActiveDiff ? 'bg-accent/15 border-l-2 border-l-accent' : isSelected ? 'bg-surface-200 border-l-2 border-l-transparent' : 'hover:bg-surface-100 border-l-2 border-l-transparent'
      }`}
      style={{ paddingLeft: `${baseIndentPx + 8 + node.depth * 8}px` }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
    >
      <span className="w-4 flex-shrink-0" />
      <span className={`font-mono w-3 flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLetter(file.status)}
      </span>
      <span className="text-text-primary truncate hover:underline">
        {node.name}
      </span>
      {overlap && (
        <span
          className="text-orange-400 text-[10px] flex-shrink-0"
          title="You also changed this file locally"
        >
          {'\u26a0'}
        </span>
      )}
      {!readOnly && (
        <div className="ml-auto flex-shrink-0 flex items-center gap-0.5">
          <button
            className="btn-icon btn-icon-xs opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onDiscard?.()
            }}
            title="Discard changes"
          >
            <ArrowUturnLeftIcon className="w-3 h-3" />
          </button>
          <button
            className="btn-icon btn-icon-xs opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onStageToggle?.()
            }}
            title={isStaged ? 'Unstage' : 'Stage'}
          >
            {isStaged ? '\u2212' : '+'}
          </button>
        </div>
      )}
    </div>
  )
}

export function GitTreeSection({
  files,
  cwd,
  selectedPaths,
  expandedPaths,
  activeDiffFile,
  onToggleExpanded,
  onClickFile,
  onSelect,
  onStageToggle,
  onDiscard,
  onContextMenu,
  disabled,
  baseIndentPx = 0,
  readOnly,
  overlapPaths
}: {
  files: GitFileStatus[]
  cwd: string
  selectedPaths: Set<string>
  expandedPaths: Set<string>
  activeDiffFile?: string | null
  onToggleExpanded: (path: string) => void
  onClickFile: (file: GitFileStatus, clickY: number) => void
  onSelect: (path: string, metaKey: boolean) => void
  onStageToggle: (file: GitFileStatus) => void
  onDiscard: (file: GitFileStatus) => void
  onContextMenu?: (file: GitFileStatus, clientX: number, clientY: number) => void
  disabled?: boolean
  /** Base left offset in px — sits the whole file tree under its section header. */
  baseIndentPx?: number
  /** Range sections (incoming/outgoing): rows carry no stage/discard affordances. */
  readOnly?: boolean
  /** Files that also have local changes — flagged on their rows. */
  overlapPaths?: Set<string>
}) {
  const flatNodes = useMemo(() => {
    if (files.length === 0) return []
    const tree = compactTree(buildGitTree(files))
    return flattenGitTree(tree, expandedPaths)
  }, [files, expandedPaths])

  return (
    <>
      {flatNodes.map((node) =>
        node.type === 'directory' ? (
          <GitTreeDirRow
            key={`d-${node.path}`}
            node={node}
            cwd={cwd}
            isSelected={selectedPaths.has(node.path)}
            onToggle={onToggleExpanded}
            onSelect={onSelect}
            baseIndentPx={baseIndentPx}
          />
        ) : (
          <GitTreeFileRow
            key={`f-${node.path}`}
            node={node}
            cwd={cwd}
            isSelected={selectedPaths.has(node.file?.path ?? node.path)}
            isActiveDiff={activeDiffFile === (node.file?.path ?? node.path)}
            onClickName={(clickY) => node.file && onClickFile(node.file, clickY)}
            onSelect={onSelect}
            onStageToggle={() => node.file && onStageToggle(node.file)}
            onDiscard={() => node.file && onDiscard(node.file)}
            onContextMenu={onContextMenu}
            disabled={disabled}
            selectedPaths={selectedPaths}
            baseIndentPx={baseIndentPx}
            readOnly={readOnly}
            overlap={overlapPaths?.has(node.file?.path ?? node.path)}
          />
        )
      )}
    </>
  )
}
