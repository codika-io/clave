import { useMemo } from 'react'
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

function FileRow({ file }: { file: GitFileStatus }) {
  const { name, dir } = splitPath(file.path)
  return (
    <div className="flex items-center gap-1.5 px-3 py-0.5 text-xs hover:bg-surface-100 transition-colors">
      <span className={`font-mono w-3 flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLetter(file.status)}
      </span>
      <span className="text-text-primary truncate">{name}</span>
      {dir && <span className="text-text-tertiary truncate ml-auto text-[10px]">{dir}</span>}
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
      {label} ({count})
    </div>
  )
}

export function GitStatusPanel({ cwd, isActive }: { cwd: string | null; isActive: boolean }) {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const { status, loading } = useGitStatus(cwd, isActive)

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
        {/* Branch header */}
        <BranchHeader branch={status.branch} ahead={status.ahead} behind={status.behind} />
        <div className="flex-1 flex items-center justify-center px-3">
          <span className="text-xs text-text-tertiary text-center">Working tree clean</span>
        </div>
      </div>
    )
  }

  if (!status) return null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Branch header */}
      <BranchHeader branch={status.branch} ahead={status.ahead} behind={status.behind} />

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {staged.length > 0 && (
          <>
            <SectionHeader label="Staged" count={staged.length} />
            {staged.map((f) => (
              <FileRow key={`s-${f.path}`} file={f} />
            ))}
          </>
        )}
        {unstaged.length > 0 && (
          <>
            <SectionHeader label="Modified" count={unstaged.length} />
            {unstaged.map((f) => (
              <FileRow key={`u-${f.path}`} file={f} />
            ))}
          </>
        )}
        {untracked.length > 0 && (
          <>
            <SectionHeader label="Untracked" count={untracked.length} />
            {untracked.map((f) => (
              <FileRow key={`t-${f.path}`} file={f} />
            ))}
          </>
        )}
      </div>
    </div>
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
          {ahead > 0 && <span className="text-green-400">{'\u2191'}{ahead}</span>}
          {ahead > 0 && behind > 0 && ' '}
          {behind > 0 && <span className="text-orange-400">{'\u2193'}{behind}</span>}
        </span>
      )}
    </div>
  )
}
