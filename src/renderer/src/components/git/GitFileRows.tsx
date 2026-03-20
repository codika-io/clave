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
  onClickName,
  onSelect,
  onStageToggle,
  onDiscard,
  disabled,
  selectedPaths
}: {
  file: GitFileStatus
  cwd: string
  isSelected?: boolean
  onClickName?: () => void
  onSelect?: (path: string, metaKey: boolean) => void
  onStageToggle?: () => void
  onDiscard?: () => void
  disabled?: boolean
  selectedPaths?: Set<string>
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
      onClickName?.()
    },
    [file.path, onClickName, onSelect]
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
      className={`flex items-center gap-1.5 px-3 py-0.5 text-xs transition-colors group ${
        disabled ? 'opacity-50 pointer-events-none' : isSelected ? 'bg-surface-200' : 'hover:bg-surface-100'
      }`}
      draggable
      onDragStart={handleDragStart}
    >
      <span className={`font-mono w-3 flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLetter(file.status)}
      </span>
      <span
        className="text-text-primary truncate cursor-pointer hover:underline"
        onClick={handleClick}
      >
        {name}
      </span>
      {dir && <span className="text-text-tertiary truncate text-[10px]">{dir}</span>}
      <div className="ml-auto flex-shrink-0 flex items-center gap-0.5">
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-surface-200 transition-all"
          onClick={(e) => {
            e.stopPropagation()
            onDiscard?.()
          }}
          title="Discard changes"
        >
          <ArrowUturnLeftIcon className="w-3 h-3" />
        </button>
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-surface-200 transition-all"
          onClick={(e) => {
            e.stopPropagation()
            onStageToggle?.()
          }}
          title={isStaged ? 'Unstage' : 'Stage'}
        >
          {isStaged ? '\u2212' : '+'}
        </button>
      </div>
    </div>
  )
}

export function GitTreeDirRow({
  node,
  cwd,
  isSelected,
  onToggle,
  onSelect
}: {
  node: FlatGitTreeNode
  cwd: string
  isSelected?: boolean
  onToggle: (path: string) => void
  onSelect?: (path: string, metaKey: boolean) => void
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
      className={`flex items-center gap-1.5 py-0.5 text-xs transition-colors cursor-pointer pr-3 ${
        isSelected ? 'bg-surface-200' : 'hover:bg-surface-100'
      }`}
      style={{ paddingLeft: `${12 + node.depth * 16}px` }}
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
  onClickName,
  onSelect,
  onStageToggle,
  onDiscard,
  disabled,
  selectedPaths
}: {
  node: FlatGitTreeNode
  cwd: string
  isSelected?: boolean
  onClickName?: () => void
  onSelect?: (path: string, metaKey: boolean) => void
  onStageToggle?: () => void
  onDiscard?: () => void
  disabled?: boolean
  selectedPaths?: Set<string>
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
      onClickName?.()
    },
    [file.path, onClickName, onSelect]
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
      className={`flex items-center gap-1.5 py-0.5 text-xs transition-colors group pr-3 ${
        disabled ? 'opacity-50 pointer-events-none' : isSelected ? 'bg-surface-200' : 'hover:bg-surface-100'
      }`}
      style={{ paddingLeft: `${12 + node.depth * 16}px` }}
      draggable
      onDragStart={handleDragStart}
    >
      <span className="w-4 flex-shrink-0" />
      <span className={`font-mono w-3 flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLetter(file.status)}
      </span>
      <span
        className="text-text-primary truncate cursor-pointer hover:underline"
        onClick={handleClick}
      >
        {node.name}
      </span>
      <div className="ml-auto flex-shrink-0 flex items-center gap-0.5">
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-surface-200 transition-all"
          onClick={(e) => {
            e.stopPropagation()
            onDiscard?.()
          }}
          title="Discard changes"
        >
          <ArrowUturnLeftIcon className="w-3 h-3" />
        </button>
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-surface-200 transition-all"
          onClick={(e) => {
            e.stopPropagation()
            onStageToggle?.()
          }}
          title={isStaged ? 'Unstage' : 'Stage'}
        >
          {isStaged ? '\u2212' : '+'}
        </button>
      </div>
    </div>
  )
}

export function GitTreeSection({
  files,
  cwd,
  selectedPaths,
  expandedPaths,
  onToggleExpanded,
  onClickFile,
  onSelect,
  onStageToggle,
  onDiscard,
  disabled
}: {
  files: GitFileStatus[]
  cwd: string
  selectedPaths: Set<string>
  expandedPaths: Set<string>
  onToggleExpanded: (path: string) => void
  onClickFile: (file: GitFileStatus) => void
  onSelect: (path: string, metaKey: boolean) => void
  onStageToggle: (file: GitFileStatus) => void
  onDiscard: (file: GitFileStatus) => void
  disabled?: boolean
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
          />
        ) : (
          <GitTreeFileRow
            key={`f-${node.path}`}
            node={node}
            cwd={cwd}
            isSelected={selectedPaths.has(node.file?.path ?? node.path)}
            onClickName={() => node.file && onClickFile(node.file)}
            onSelect={onSelect}
            onStageToggle={() => node.file && onStageToggle(node.file)}
            onDiscard={() => node.file && onDiscard(node.file)}
            disabled={disabled}
            selectedPaths={selectedPaths}
          />
        )
      )}
    </>
  )
}
