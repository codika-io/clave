import { useMemo, useState, useCallback } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useGitStatus } from '../../hooks/use-git-status'
import type { GitFileStatus } from '../../../../preload/index.d'

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
  onClick,
  disabled
}: {
  file: GitFileStatus
  onClick?: () => void
  disabled?: boolean
}) {
  const { name, dir } = splitPath(file.path)
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-0.5 text-xs transition-colors ${
        disabled ? 'opacity-50 pointer-events-none' : 'hover:bg-surface-100 cursor-pointer'
      }`}
      onClick={onClick}
    >
      <span className={`font-mono w-3 flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLetter(file.status)}
      </span>
      <span className="text-text-primary truncate">{name}</span>
      {dir && <span className="text-text-tertiary truncate ml-auto text-[10px]">{dir}</span>}
    </div>
  )
}

function SectionHeader({
  label,
  count,
  action,
  onAction,
  disabled
}: {
  label: string
  count: number
  action?: string
  onAction?: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center px-3 pt-2.5 pb-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label} ({count})
      </span>
      {action && onAction && (
        <button
          className="ml-auto text-[10px] text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
          onClick={onAction}
          disabled={disabled}
        >
          {action}
        </button>
      )}
    </div>
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

export function GitStatusPanel({ cwd, isActive }: { cwd: string | null; isActive: boolean }) {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const { status, loading, refresh } = useGitStatus(cwd, isActive)
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { staged, unstaged, untracked } = useMemo(() => {
    if (!status?.files) return { staged: [], unstaged: [], untracked: [] }
    const staged: GitFileStatus[] = []
    const unstaged: GitFileStatus[] = []
    const untracked: GitFileStatus[] = []
    for (const f of status.files) {
      if (f.status === 'untracked') {
        untracked.push(f)
      } else if (f.staged) {
        staged.push(f)
      } else {
        unstaged.push(f)
      }
    }
    return { staged, unstaged, untracked }
  }, [status?.files])

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
      if (!cwd) return
      runOperation(() => window.electronAPI.gitStage(cwd, [path]))
    },
    [cwd, runOperation]
  )

  const unstageFile = useCallback(
    (path: string) => {
      if (!cwd) return
      runOperation(() => window.electronAPI.gitUnstage(cwd, [path]))
    },
    [cwd, runOperation]
  )

  const stageAll = useCallback(
    (files: GitFileStatus[]) => {
      if (!cwd) return
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
    if (!cwd) return
    runOperation(() =>
      window.electronAPI.gitUnstage(
        cwd,
        staged.map((f) => f.path)
      )
    )
  }, [cwd, staged, runOperation])

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

  if (status && status.files.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <BranchHeader branch={status.branch} ahead={status.ahead} behind={status.behind} />
        {error && <ErrorBanner message={error} />}
        <div className="flex-1 flex items-center justify-center px-3">
          <span className="text-xs text-text-tertiary text-center">Working tree clean</span>
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
      </div>
    )
  }

  if (!status) return null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <BranchHeader branch={status.branch} ahead={status.ahead} behind={status.behind} />
      {error && <ErrorBanner message={error} />}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {staged.length > 0 && (
          <>
            <SectionHeader
              label="Staged"
              count={staged.length}
              action="Unstage All"
              onAction={unstageAll}
              disabled={operating}
            />
            {staged.map((f) => (
              <FileRow
                key={`s-${f.path}`}
                file={f}
                onClick={() => unstageFile(f.path)}
                disabled={operating}
              />
            ))}
          </>
        )}
        {unstaged.length > 0 && (
          <>
            <SectionHeader
              label="Modified"
              count={unstaged.length}
              action="Stage All"
              onAction={() => stageAll(unstaged)}
              disabled={operating}
            />
            {unstaged.map((f) => (
              <FileRow
                key={`u-${f.path}`}
                file={f}
                onClick={() => stageFile(f.path)}
                disabled={operating}
              />
            ))}
          </>
        )}
        {untracked.length > 0 && (
          <>
            <SectionHeader
              label="Untracked"
              count={untracked.length}
              action="Stage All"
              onAction={() => stageAll(untracked)}
              disabled={operating}
            />
            {untracked.map((f) => (
              <FileRow
                key={`t-${f.path}`}
                file={f}
                onClick={() => stageFile(f.path)}
                disabled={operating}
              />
            ))}
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
      {(ahead > 0 || behind > 0) && (
        <span className="text-text-tertiary ml-auto flex-shrink-0">
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
    </div>
  )
}
