import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useGitStatus } from '../../hooks/use-git-status'
import { FileIcon } from '../files/file-icons'
import { ListBulletIcon, Bars3BottomLeftIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { buildGitTree, compactTree, flattenGitTree, collectAllDirPaths } from '../../lib/git-file-tree'
import type { GitFileStatus, GitStatusResult } from '../../../../preload/index.d'
import type { FlatGitTreeNode } from '../../lib/git-file-tree'

function statusLetter(status: GitFileStatus['status']): string {
  switch (status) {
    case 'staged':
      return 'A'
    case 'modified':
      return 'M'
    case 'deleted':
      return 'D'
    case 'untracked':
      return '?'
    case 'staged-modified':
      return 'M'
    case 'staged-deleted':
      return 'D'
    case 'renamed':
      return 'R'
  }
}

function statusColor(status: GitFileStatus['status']): string {
  switch (status) {
    case 'staged':
    case 'renamed':
      return 'text-green-400'
    case 'modified':
    case 'staged-modified':
      return 'text-orange-400'
    case 'deleted':
    case 'staged-deleted':
      return 'text-red-400'
    case 'untracked':
      return 'text-text-tertiary'
  }
}

function splitPath(filePath: string): { name: string; dir: string } {
  const lastSlash = filePath.lastIndexOf('/')
  if (lastSlash === -1) return { name: filePath, dir: '' }
  return { name: filePath.slice(lastSlash + 1), dir: filePath.slice(0, lastSlash + 1) }
}

function FileRow({
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

function SectionHeader({
  label,
  count,
  action,
  onAction,
  discardAction,
  onDiscardAction,
  disabled
}: {
  label: string
  count: number
  action?: string
  onAction?: () => void
  discardAction?: string
  onDiscardAction?: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center px-3 pt-2.5 pb-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label} ({count})
      </span>
      <span className="ml-auto flex items-center gap-2">
        {discardAction && onDiscardAction && (
          <button
            className="text-[10px] text-text-tertiary hover:text-red-400 transition-colors disabled:opacity-50"
            onClick={onDiscardAction}
            disabled={disabled}
          >
            {discardAction}
          </button>
        )}
        {action && onAction && (
          <button
            className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
            onClick={onAction}
            disabled={disabled}
          >
            {action}
          </button>
        )}
      </span>
    </div>
  )
}

function ViewModeToggle() {
  const gitViewMode = useSessionStore((s) => s.gitViewMode)
  const setGitViewMode = useSessionStore((s) => s.setGitViewMode)
  return (
    <div className="flex items-center bg-surface-100 rounded p-0.5 gap-0.5">
      <button
        className={`p-0.5 rounded transition-colors ${
          gitViewMode === 'list'
            ? 'bg-surface-200 text-text-primary'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        onClick={() => setGitViewMode('list')}
        title="List view"
      >
        <ListBulletIcon className="w-3 h-3" />
      </button>
      <button
        className={`p-0.5 rounded transition-colors ${
          gitViewMode === 'tree'
            ? 'bg-surface-200 text-text-primary'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        onClick={() => setGitViewMode('tree')}
        title="Tree view"
      >
        <Bars3BottomLeftIcon className="w-3 h-3" />
      </button>
    </div>
  )
}

function GitTreeDirRow({
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

function GitTreeFileRow({
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

function GitTreeSection({
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

function CommitBar({
  cwd,
  stagedCount,
  ahead,
  behind,
  operating,
  onOperation
}: {
  cwd: string
  stagedCount: number
  ahead: number
  behind: number
  operating: boolean
  onOperation: (fn: () => Promise<void>) => void
}) {
  const [commitMessage, setCommitMessage] = useState('')

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim() || stagedCount === 0) return
    const msg = commitMessage
    onOperation(async () => {
      await window.electronAPI.gitCommit(cwd, msg)
      setCommitMessage('')
    })
  }, [cwd, commitMessage, stagedCount, onOperation])

  const handlePush = useCallback(() => {
    onOperation(async () => {
      await window.electronAPI.gitPush(cwd)
    })
  }, [cwd, onOperation])

  const handlePull = useCallback(() => {
    onOperation(async () => {
      await window.electronAPI.gitPull(cwd)
    })
  }, [cwd, onOperation])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        handleCommit()
      }
    },
    [handleCommit]
  )

  return (
    <div className="border-t border-border-subtle p-2 flex-shrink-0 flex flex-col gap-1.5">
      <textarea
        className="w-full bg-surface-100 text-text-primary text-xs rounded px-2 py-1.5 resize-none outline-none border border-transparent focus:border-accent placeholder:text-text-tertiary"
        rows={2}
        placeholder="Commit message..."
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={operating}
      />
      <div className="flex items-center gap-1.5">
        <button
          className="flex-1 text-xs font-medium px-2 py-1 rounded bg-accent text-white disabled:opacity-40 transition-opacity"
          disabled={operating || stagedCount === 0 || !commitMessage.trim()}
          onClick={handleCommit}
        >
          Commit
        </button>
        {ahead > 0 && (
          <button
            className="text-xs font-medium px-2 py-1 rounded bg-surface-100 text-text-secondary hover:text-text-primary disabled:opacity-40 transition-all"
            disabled={operating}
            onClick={handlePush}
            title="Push"
          >
            {'\u2191'} Push
          </button>
        )}
        {behind > 0 && (
          <button
            className="text-xs font-medium px-2 py-1 rounded bg-surface-100 text-text-secondary hover:text-text-primary disabled:opacity-40 transition-all"
            disabled={operating}
            onClick={handlePull}
            title="Pull"
          >
            {'\u2193'} Pull
          </button>
        )}
      </div>
    </div>
  )
}

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk' | 'binary'
  content: string
}

function parseDiffLines(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  const rawLines = raw.split('\n')

  if (rawLines.some((l) => l.startsWith('Binary files') && l.includes('differ'))) {
    return [{ type: 'binary', content: 'Binary file' }]
  }

  let inHunk = false
  for (const line of rawLines) {
    if (line.startsWith('@@')) {
      inHunk = true
      lines.push({ type: 'hunk', content: line })
    } else if (inHunk) {
      if (line.startsWith('+')) {
        lines.push({ type: 'add', content: line.slice(1) })
      } else if (line.startsWith('-')) {
        lines.push({ type: 'del', content: line.slice(1) })
      } else {
        lines.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line })
      }
    }
  }
  return lines
}

function GitDiffView({
  file,
  cwd,
  onBack,
  onStageToggle,
  operating
}: {
  file: GitFileStatus
  cwd: string
  onBack: () => void
  onStageToggle: () => void
  operating: boolean
}) {
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isUntracked = file.status === 'untracked'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.electronAPI
      .gitDiff(cwd, file.path, file.staged, isUntracked)
      .then((result) => {
        if (!cancelled) setDiff(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cwd, file.path, file.staged, isUntracked])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onBack])

  const diffLines = useMemo(() => {
    if (diff === null) return []
    if (isUntracked) {
      return diff.split('\n').map((line) => ({ type: 'add' as const, content: line }))
    }
    return parseDiffLines(diff)
  }, [diff, isUntracked])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle flex-shrink-0">
        <button
          className="text-text-tertiary hover:text-text-primary transition-colors"
          onClick={onBack}
          title="Back (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className={`font-mono text-xs flex-shrink-0 ${statusColor(file.status)}`}>
          {statusLetter(file.status)}
        </span>
        <span className="text-xs text-text-primary truncate">{file.path}</span>
        <button
          className="ml-auto flex-shrink-0 text-xs px-1.5 py-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-200 transition-all"
          onClick={onStageToggle}
          disabled={operating}
          title={file.staged ? 'Unstage' : 'Stage'}
        >
          {file.staged ? 'Unstage' : 'Stage'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto font-mono text-[11px] leading-[18px]">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-tertiary">Loading diff...</span>
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-xs text-red-400">{error}</div>
        )}
        {!loading && !error && diffLines.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-tertiary">No changes</span>
          </div>
        )}
        {!loading &&
          !error &&
          diffLines.map((line, i) => {
            let bg = ''
            let textColor = 'text-text-secondary'
            if (line.type === 'add') {
              bg = 'bg-green-500/10'
              textColor = 'text-green-400'
            } else if (line.type === 'del') {
              bg = 'bg-red-500/10'
              textColor = 'text-red-400'
            } else if (line.type === 'hunk') {
              bg = 'bg-blue-500/10'
              textColor = 'text-blue-400'
            } else if (line.type === 'binary') {
              textColor = 'text-text-tertiary'
            }
            return (
              <div key={i} className={`px-3 whitespace-pre ${bg} ${textColor}`}>
                {line.type === 'add' && <span className="select-none mr-1">+</span>}
                {line.type === 'del' && <span className="select-none mr-1">-</span>}
                {line.type === 'context' && <span className="select-none mr-1">{' '}</span>}
                {line.content}
              </div>
            )
          })}
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs flex-shrink-0">{message}</div>
  )
}

function BranchHeader({
  branch,
  ahead,
  behind
}: {
  branch: string
  ahead: number
  behind: number
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border-subtle text-xs flex-shrink-0">
      {/* Branch icon */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="text-text-secondary flex-shrink-0"
      >
        <circle cx="6" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="6" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 4v4" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="text-text-primary font-medium truncate">{branch}</span>
      <span className="ml-auto flex-shrink-0 flex items-center gap-1.5">
        {(ahead > 0 || behind > 0) && (
          <span className="text-text-tertiary">
            {ahead > 0 && (
              <span className="text-green-400">
                {'\u2191'}
                {ahead}
              </span>
            )}
            {ahead > 0 && behind > 0 && ' '}
            {behind > 0 && (
              <span className="text-orange-400">
                {'\u2193'}
                {behind}
              </span>
            )}
          </span>
        )}
        <ViewModeToggle />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RepoSection — reusable file list + commit bar + diff view for a single repo
// ---------------------------------------------------------------------------

function RepoSection({
  cwd,
  status,
  filterPrefix,
  refresh,
  fillHeight = true,
  onDiffOpen,
  onDiffClose
}: {
  cwd: string
  status: GitStatusResult
  filterPrefix?: string | null
  refresh: () => void
  fillHeight?: boolean
  onDiffOpen?: () => void
  onDiffClose?: () => void
}) {
  const setFileTreeWidthOverride = useSessionStore((s) => s.setFileTreeWidthOverride)
  const gitViewMode = useSessionStore((s) => s.gitViewMode)
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [confirmDiscard, setConfirmDiscard] = useState<{
    files: Array<{ path: string; status: string; staged: boolean }>
    label: string
  } | null>(null)
  const prevViewMode = useRef(gitViewMode)

  // Width override for diff view
  useEffect(() => {
    if (selectedFile) {
      const currentWidth = useSessionStore.getState().fileTreeWidth
      setFileTreeWidthOverride(Math.max(currentWidth, Math.floor(window.innerWidth * 0.5)))
      onDiffOpen?.()
    } else {
      setFileTreeWidthOverride(null)
      onDiffClose?.()
    }
  }, [selectedFile, setFileTreeWidthOverride, onDiffOpen, onDiffClose])

  useEffect(() => {
    return () => setFileTreeWidthOverride(null)
  }, [setFileTreeWidthOverride])

  // Auto-clear selectedFile when it disappears from the status list
  useEffect(() => {
    if (!selectedFile || !status?.files) return
    const stillExists = status.files.some(
      (f) => f.path === selectedFile.path && f.staged === selectedFile.staged
    )
    if (!stillExists) setSelectedFile(null)
  }, [status?.files, selectedFile])

  // Auto-expand all dirs when switching to tree mode
  useEffect(() => {
    if (gitViewMode === 'tree' && prevViewMode.current === 'list' && status?.files) {
      const allFiles = status.files
      const tree = compactTree(buildGitTree(allFiles))
      setExpandedPaths(collectAllDirPaths(tree))
    }
    prevViewMode.current = gitViewMode
  }, [gitViewMode, status?.files])

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  // Compute relative filter prefix from the repo root
  const relativeFilterPrefix = useMemo(() => {
    if (!filterPrefix || !status?.repoRoot) return null
    const repoRoot = status.repoRoot
    if (!filterPrefix.startsWith(repoRoot + '/')) return null
    return filterPrefix.slice(repoRoot.length + 1) + '/'
  }, [filterPrefix, status?.repoRoot])

  const { staged, unstaged, untracked } = useMemo(() => {
    if (!status?.files) return { staged: [], unstaged: [], untracked: [] }
    const staged: GitFileStatus[] = []
    const unstaged: GitFileStatus[] = []
    const untracked: GitFileStatus[] = []
    for (const f of status.files) {
      if (relativeFilterPrefix && !f.path.startsWith(relativeFilterPrefix)) continue
      if (f.status === 'untracked') {
        untracked.push(f)
      } else if (f.staged) {
        staged.push(f)
      } else {
        unstaged.push(f)
      }
    }
    return { staged, unstaged, untracked }
  }, [status?.files, relativeFilterPrefix])

  const runOperation = useCallback(
    async (fn: () => Promise<void>) => {
      setError(null)
      setOperating(true)
      try {
        await fn()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setOperating(false)
        refresh()
      }
    },
    [refresh]
  )

  const stageFile = useCallback(
    (path: string) => {
      runOperation(() => window.electronAPI.gitStage(cwd, [path]))
    },
    [cwd, runOperation]
  )

  const unstageFile = useCallback(
    (path: string) => {
      runOperation(() => window.electronAPI.gitUnstage(cwd, [path]))
    },
    [cwd, runOperation]
  )

  const stageAll = useCallback(
    (files: GitFileStatus[]) => {
      runOperation(() =>
        window.electronAPI.gitStage(
          cwd,
          files.map((f) => f.path)
        )
      )
    },
    [cwd, runOperation]
  )

  const unstageAll = useCallback(() => {
    runOperation(() =>
      window.electronAPI.gitUnstage(
        cwd,
        staged.map((f) => f.path)
      )
    )
  }, [cwd, staged, runOperation])

  const promptDiscardFile = useCallback((file: GitFileStatus) => {
    const name = file.path.includes('/') ? file.path.split('/').pop()! : file.path
    setConfirmDiscard({
      files: [{ path: file.path, status: file.status, staged: file.staged }],
      label: `Discard changes to ${name}? This cannot be undone.`
    })
  }, [])

  const promptDiscardAll = useCallback((files: GitFileStatus[]) => {
    setConfirmDiscard({
      files: files.map((f) => ({ path: f.path, status: f.status, staged: f.staged })),
      label: `Discard all changes in ${files.length} file${files.length === 1 ? '' : 's'}? This cannot be undone.`
    })
  }, [])

  const executeDiscard = useCallback(() => {
    if (!confirmDiscard) return
    const filesToDiscard = confirmDiscard.files
    setConfirmDiscard(null)
    runOperation(() => window.electronAPI.gitDiscard(cwd, filesToDiscard))
  }, [cwd, confirmDiscard, runOperation])

  const totalFiltered = staged.length + unstaged.length + untracked.length

  // Diff view
  if (selectedFile) {
    const diffView = (
      <GitDiffView
        file={selectedFile}
        cwd={cwd}
        onBack={() => setSelectedFile(null)}
        onStageToggle={() => {
          if (selectedFile.staged) {
            unstageFile(selectedFile.path)
          } else {
            stageFile(selectedFile.path)
          }
        }}
        operating={operating}
      />
    )
    return fillHeight ? diffView : (
      <div className="flex flex-col h-[50vh]">{diffView}</div>
    )
  }

  // Clean state
  if (status.files.length === 0 || (relativeFilterPrefix && totalFiltered === 0)) {
    return (
      <>
        {error && <ErrorBanner message={error} />}
        <div className={`${fillHeight ? 'flex-1' : ''} flex items-center justify-center px-3 py-4`}>
          <span className="text-xs text-text-tertiary text-center">
            {relativeFilterPrefix ? 'No changes in this folder' : 'Working tree clean'}
          </span>
        </div>
        {(status.ahead > 0 || status.behind > 0) && (
          <CommitBar
            cwd={cwd}
            stagedCount={0}
            ahead={status.ahead}
            behind={status.behind}
            operating={operating}
            onOperation={runOperation}
          />
        )}
      </>
    )
  }

  // File list + commit bar
  return (
    <>
      {error && <ErrorBanner message={error} />}
      {relativeFilterPrefix && (
        <div className="px-3 py-1 text-[10px] text-text-tertiary border-b border-border-subtle flex-shrink-0">
          Filtered to: {relativeFilterPrefix}
        </div>
      )}
      <div className={`${fillHeight ? 'flex-1 overflow-y-auto' : ''}`}>
        {staged.length > 0 && (
          <>
            <SectionHeader
              label="Staged"
              count={staged.length}
              action="Unstage All"
              onAction={unstageAll}
              discardAction="Discard All"
              onDiscardAction={() => promptDiscardAll(staged)}
              disabled={operating}
            />
            {gitViewMode === 'tree' ? (
              <GitTreeSection
                files={staged}
                expandedPaths={expandedPaths}
                onToggleExpanded={toggleExpanded}
                onClickFile={setSelectedFile}
                onStageToggle={(f) => unstageFile(f.path)}
                onDiscard={promptDiscardFile}
                disabled={operating}
              />
            ) : (
              staged.map((f) => (
                <FileRow
                  key={`s-${f.path}`}
                  file={f}
                  onClickName={() => setSelectedFile(f)}
                  onStageToggle={() => unstageFile(f.path)}
                  onDiscard={() => promptDiscardFile(f)}
                  disabled={operating}
                />
              ))
            )}
          </>
        )}
        {unstaged.length > 0 && (
          <>
            <SectionHeader
              label="Modified"
              count={unstaged.length}
              action="Stage All"
              onAction={() => stageAll(unstaged)}
              discardAction="Discard All"
              onDiscardAction={() => promptDiscardAll(unstaged)}
              disabled={operating}
            />
            {gitViewMode === 'tree' ? (
              <GitTreeSection
                files={unstaged}
                expandedPaths={expandedPaths}
                onToggleExpanded={toggleExpanded}
                onClickFile={setSelectedFile}
                onStageToggle={(f) => stageFile(f.path)}
                onDiscard={promptDiscardFile}
                disabled={operating}
              />
            ) : (
              unstaged.map((f) => (
                <FileRow
                  key={`u-${f.path}`}
                  file={f}
                  onClickName={() => setSelectedFile(f)}
                  onStageToggle={() => stageFile(f.path)}
                  onDiscard={() => promptDiscardFile(f)}
                  disabled={operating}
                />
              ))
            )}
          </>
        )}
        {untracked.length > 0 && (
          <>
            <SectionHeader
              label="Untracked"
              count={untracked.length}
              action="Stage All"
              onAction={() => stageAll(untracked)}
              discardAction="Discard All"
              onDiscardAction={() => promptDiscardAll(untracked)}
              disabled={operating}
            />
            {gitViewMode === 'tree' ? (
              <GitTreeSection
                files={untracked}
                expandedPaths={expandedPaths}
                onToggleExpanded={toggleExpanded}
                onClickFile={setSelectedFile}
                onStageToggle={(f) => stageFile(f.path)}
                onDiscard={promptDiscardFile}
                disabled={operating}
              />
            ) : (
              untracked.map((f) => (
                <FileRow
                  key={`t-${f.path}`}
                  file={f}
                  onClickName={() => setSelectedFile(f)}
                  onStageToggle={() => stageFile(f.path)}
                  onDiscard={() => promptDiscardFile(f)}
                  disabled={operating}
                />
              ))
            )}
          </>
        )}
      </div>
      <CommitBar
        cwd={cwd}
        stagedCount={staged.length}
        ahead={status.ahead}
        behind={status.behind}
        operating={operating}
        onOperation={runOperation}
      />
      <ConfirmDialog
        isOpen={confirmDiscard !== null}
        title="Discard changes"
        message={confirmDiscard?.label ?? ''}
        onConfirm={executeDiscard}
        onCancel={() => setConfirmDiscard(null)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// GitStatusPanel — single-repo view (existing behavior)
// ---------------------------------------------------------------------------

export function GitStatusPanel({ cwd, isActive, filterPrefix }: { cwd: string | null; isActive: boolean; filterPrefix?: string | null }) {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const { status, loading, refresh } = useGitStatus(cwd, isActive)

  if (!focusedSessionId || !cwd) {
    return (
      <div className="flex-1 flex items-center justify-center px-3">
        <span className="text-xs text-text-tertiary text-center">
          Focus a session to view git status
        </span>
      </div>
    )
  }

  if (loading && !status) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-text-tertiary">Loading...</span>
      </div>
    )
  }

  if (status && !status.isRepo) {
    return (
      <div className="flex-1 flex items-center justify-center px-3">
        <span className="text-xs text-text-tertiary text-center">Not a git repository</span>
      </div>
    )
  }

  if (!status) return null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <BranchHeader branch={status.branch} ahead={status.ahead} behind={status.behind} />
      <RepoSection cwd={cwd} status={status} filterPrefix={filterPrefix} refresh={refresh} fillHeight />
    </div>
  )
}

// ---------------------------------------------------------------------------
// MultiRepoGitPanel — multi-repo collapsible view
// ---------------------------------------------------------------------------

function MultiRepoSection({
  name,
  repoPath,
  status,
  refresh
}: {
  name: string
  repoPath: string
  status: GitStatusResult
  refresh: () => void
}) {
  const changeCount = status.files.length
  const hasChanges = changeCount > 0
  const hasRemoteChanges = status.behind > 0
  const shouldExpand = hasChanges || hasRemoteChanges
  const [expanded, setExpanded] = useState(shouldExpand)
  const initializedRef = useRef(false)

  // Update default expanded state when changes appear/disappear, but only on first load
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      setExpanded(shouldExpand)
    }
  }, [shouldExpand])

  return (
    <div className="border-b border-border-subtle">
      {/* Collapsible header */}
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-surface-100 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`text-text-tertiary flex-shrink-0 transition-transform duration-150 ${
            expanded ? 'rotate-90' : ''
          }`}
        >
          <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Repo name */}
        <span className="text-text-primary font-medium truncate">{name}</span>

        {/* Branch badge */}
        <span className="text-text-tertiary truncate">{status.branch}</span>

        {/* Badges (right-aligned) */}
        <span className="ml-auto flex-shrink-0 flex items-center gap-1.5">
          {status.behind > 0 && (
            <span className="text-[10px] font-medium text-orange-400">
              {'\u2193'}{status.behind}
            </span>
          )}
          {status.ahead > 0 && (
            <span className="text-[10px] font-medium text-green-400">
              {'\u2191'}{status.ahead}
            </span>
          )}
          {changeCount > 0 && (
            <span className="text-[10px] font-medium bg-surface-200 text-text-secondary rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {changeCount}
            </span>
          )}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="flex flex-col">
          <RepoSection
            cwd={repoPath}
            status={status}
            refresh={refresh}
            fillHeight={false}
          />
        </div>
      )}
    </div>
  )
}

export function MultiRepoGitPanel({
  repos,
  refresh
}: {
  repos: Array<{ name: string; path: string; status: GitStatusResult }>
  refresh: () => void
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-end px-3 py-1 border-b border-border-subtle flex-shrink-0">
        <ViewModeToggle />
      </div>
      <div className="flex-1 overflow-y-auto">
        {repos.map((repo) => (
          <MultiRepoSection
            key={repo.path}
            name={repo.name}
            repoPath={repo.path}
            status={repo.status}
            refresh={refresh}
          />
        ))}
      </div>
    </div>
  )
}
