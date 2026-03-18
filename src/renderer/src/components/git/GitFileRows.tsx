import { useMemo } from 'react'
import { FileIcon } from '../files/file-icons'
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { statusLetter, statusColor, splitPath } from './git-status-utils'
import { buildGitTree, compactTree, flattenGitTree } from '../../lib/git-file-tree'
import type { GitFileStatus } from '../../../../preload/index.d'
import type { FlatGitTreeNode } from '../../lib/git-file-tree'

export function FileRow({
  file,
  onClickName,
  onStageToggle,
  onDiscard,
  disabled
}: {
  file: GitFileStatus
  onClickName?: () => void
  onStageToggle?: () => void
  onDiscard?: () => void
  disabled?: boolean
}) {
  const { name, dir } = splitPath(file.path)
  const isStaged = file.staged
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-0.5 text-xs transition-colors group ${
        disabled ? 'opacity-50 pointer-events-none' : 'hover:bg-surface-100'
      }`}
    >
      <span className={`font-mono w-3 flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLetter(file.status)}
      </span>
      <span
        className="text-text-primary truncate cursor-pointer hover:underline"
        onClick={onClickName}
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
  onToggle
}: {
  node: FlatGitTreeNode
  onToggle: (path: string) => void
}) {
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 text-xs hover:bg-surface-100 transition-colors cursor-pointer pr-3"
      style={{ paddingLeft: `${12 + node.depth * 16}px` }}
      onClick={() => onToggle(node.path)}
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
  onClickName,
  onStageToggle,
  onDiscard,
  disabled
}: {
  node: FlatGitTreeNode
  onClickName?: () => void
  onStageToggle?: () => void
  onDiscard?: () => void
  disabled?: boolean
}) {
  const file = node.file!
  const isStaged = file.staged
  return (
    <div
      className={`flex items-center gap-1.5 py-0.5 text-xs transition-colors group pr-3 ${
        disabled ? 'opacity-50 pointer-events-none' : 'hover:bg-surface-100'
      }`}
      style={{ paddingLeft: `${12 + node.depth * 16}px` }}
    >
      <span className="w-4 flex-shrink-0" />
      <span className={`font-mono w-3 flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLetter(file.status)}
      </span>
      <span
        className="text-text-primary truncate cursor-pointer hover:underline"
        onClick={onClickName}
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
  expandedPaths,
  onToggleExpanded,
  onClickFile,
  onStageToggle,
  onDiscard,
  disabled
}: {
  files: GitFileStatus[]
  expandedPaths: Set<string>
  onToggleExpanded: (path: string) => void
  onClickFile: (file: GitFileStatus) => void
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
          <GitTreeDirRow key={`d-${node.path}`} node={node} onToggle={onToggleExpanded} />
        ) : (
          <GitTreeFileRow
            key={`f-${node.path}`}
            node={node}
            onClickName={() => node.file && onClickFile(node.file)}
            onStageToggle={() => node.file && onStageToggle(node.file)}
            onDiscard={() => node.file && onDiscard(node.file)}
            disabled={disabled}
          />
        )
      )}
    </>
  )
}
