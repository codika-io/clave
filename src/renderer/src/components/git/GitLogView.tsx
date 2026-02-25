import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSessionStore } from '../../store/session-store'
import type { GitLogEntry, GitCommitFileStatus } from '../../../../preload/index.d'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

function commitFileStatusLetter(status: GitCommitFileStatus['status']): string {
  return status
}

function commitFileStatusColor(status: GitCommitFileStatus['status']): string {
  switch (status) {
    case 'A':
      return 'text-green-400'
    case 'M':
    case 'T':
      return 'text-orange-400'
    case 'D':
      return 'text-red-400'
    case 'R':
    case 'C':
      return 'text-blue-400'
  }
}

// ---------------------------------------------------------------------------
// DiffLine parser (same logic as GitStatusPanel)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CommitDiffView — shows diff for a single file in a commit
// ---------------------------------------------------------------------------

function CommitDiffView({
  cwd,
  hash,
  filePath,
  fileStatus,
  onBack
}: {
  cwd: string
  hash: string
  filePath: string
  fileStatus: GitCommitFileStatus['status']
  onBack: () => void
}) {
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.electronAPI
      .gitCommitDiff(cwd, hash, filePath)
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
  }, [cwd, hash, filePath])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onBack])

  const diffLines = useMemo(() => {
    if (diff === null) return []
    // If the diff doesn't contain hunks, treat it as a new file (all additions)
    if (!diff.includes('@@')) {
      return diff.split('\n').map((line) => ({ type: 'add' as const, content: line }))
    }
    return parseDiffLines(diff)
  }, [diff])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle flex-shrink-0">
        <button
          className="text-text-tertiary hover:text-text-primary transition-colors"
          onClick={onBack}
          title="Back (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 3L5 7l4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className={`font-mono text-xs flex-shrink-0 ${commitFileStatusColor(fileStatus)}`}>
          {commitFileStatusLetter(fileStatus)}
        </span>
        <span className="text-xs text-text-primary truncate">{filePath}</span>
      </div>

      <div className="flex-1 overflow-auto font-mono text-[11px] leading-[18px]">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-tertiary">Loading diff...</span>
          </div>
        )}
        {error && <div className="px-3 py-2 text-xs text-red-400">{error}</div>}
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

// ---------------------------------------------------------------------------
// CommitDetail — expanded commit showing changed files
// ---------------------------------------------------------------------------

function CommitDetail({
  cwd,
  commit,
  onSelectFile,
  onClose
}: {
  cwd: string
  commit: GitLogEntry
  onSelectFile: (file: GitCommitFileStatus) => void
  onClose: () => void
}) {
  const [files, setFiles] = useState<GitCommitFileStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.electronAPI
      .gitCommitFiles(cwd, commit.hash)
      .then((result) => {
        if (!cancelled) setFiles(result)
      })
      .catch(() => {
        if (!cancelled) setFiles([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cwd, commit.hash])

  return (
    <div className="border-t border-border-subtle bg-surface-50/50">
      {/* Commit metadata */}
      <div className="px-3 py-1.5 space-y-0.5">
        <div className="text-[10px] text-text-tertiary flex items-center gap-2">
          <span>{commit.author}</span>
          <span>{relativeTime(commit.date)}</span>
          <button
            className="ml-auto text-text-tertiary hover:text-text-primary transition-colors"
            onClick={onClose}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M2 2l6 6M8 2l-6 6"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Changed files */}
      {loading ? (
        <div className="px-3 py-2 text-[10px] text-text-tertiary">Loading files...</div>
      ) : files.length === 0 ? (
        <div className="px-3 py-2 text-[10px] text-text-tertiary">No files changed</div>
      ) : (
        <div className="pb-1">
          {files.map((file) => {
            const fileName = file.path.includes('/')
              ? file.path.split('/').pop()!
              : file.path
            const dir = file.path.includes('/')
              ? file.path.slice(0, file.path.lastIndexOf('/') + 1)
              : ''
            return (
              <div
                key={file.path}
                className="flex items-center gap-1.5 px-3 py-0.5 text-xs hover:bg-surface-100 transition-colors cursor-pointer group"
                onClick={() => onSelectFile(file)}
              >
                <span
                  className={`font-mono w-3 flex-shrink-0 ${commitFileStatusColor(file.status)}`}
                >
                  {commitFileStatusLetter(file.status)}
                </span>
                <span className="text-text-primary truncate hover:underline">{fileName}</span>
                {dir && (
                  <span className="text-text-tertiary truncate text-[10px]">{dir}</span>
                )}
                <span className="ml-auto flex-shrink-0 text-[10px] font-mono text-text-tertiary">
                  {file.insertions > 0 && (
                    <span className="text-green-400">+{file.insertions}</span>
                  )}
                  {file.insertions > 0 && file.deletions > 0 && ' '}
                  {file.deletions > 0 && (
                    <span className="text-red-400">-{file.deletions}</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CommitRow — a single row in the log list
// ---------------------------------------------------------------------------

function CommitRow({
  commit,
  isExpanded,
  onClick,
  variant
}: {
  commit: GitLogEntry
  isExpanded: boolean
  onClick: () => void
  variant?: 'outgoing' | 'incoming' | 'normal'
}) {
  // Subtle left border for outgoing/incoming commits
  const borderClass =
    variant === 'outgoing'
      ? 'border-l-2 border-l-green-400/40'
      : variant === 'incoming'
        ? 'border-l-2 border-l-orange-400/40'
        : 'border-l-2 border-l-transparent'

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 text-xs transition-colors cursor-pointer ${borderClass} ${
        isExpanded ? 'bg-surface-100' : 'hover:bg-surface-100/50'
      }`}
      onClick={onClick}
    >
      <span className="font-mono text-text-tertiary flex-shrink-0 text-[10px]">
        {commit.shortHash}
      </span>
      <span className="text-text-primary truncate flex-1">{commit.message}</span>
      <span className="text-[10px] text-text-tertiary flex-shrink-0 whitespace-nowrap">
        {relativeTime(commit.date)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SectionHeader for the log
// ---------------------------------------------------------------------------

function LogSectionHeader({
  label,
  count,
  color,
  action,
  onAction,
  actionDisabled
}: {
  label: string
  count: number
  color: string
  action?: string
  onAction?: () => void
  actionDisabled?: boolean
}) {
  return (
    <div className="flex items-center px-3 pt-2.5 pb-1">
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${color}`}>
        {label} ({count})
      </span>
      {action && onAction && (
        <button
          className={`ml-auto text-[10px] font-medium ${color} hover:brightness-125 transition-all disabled:opacity-40`}
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
          disabled={actionDisabled}
        >
          {action}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SyncDivider — visual separator between sections
// ---------------------------------------------------------------------------

function SyncDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <div className="flex-1 h-px bg-border-subtle" />
      <span className="text-[9px] uppercase tracking-wider text-text-tertiary font-medium">
        {label}
      </span>
      <div className="flex-1 h-px bg-border-subtle" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// GitLogView — main exported component
// ---------------------------------------------------------------------------

export function GitLogView({
  cwd,
  branch,
  ahead,
  behind
}: {
  cwd: string
  branch: string
  ahead: number
  behind: number
}) {
  const setFileTreeWidthOverride = useSessionStore((s) => s.setFileTreeWidthOverride)
  const [outgoing, setOutgoing] = useState<GitLogEntry[]>([])
  const [incoming, setIncoming] = useState<GitLogEntry[]>([])
  const [history, setHistory] = useState<GitLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedHash, setExpandedHash] = useState<string | null>(null)
  const [diffFile, setDiffFile] = useState<{
    hash: string
    file: GitCommitFileStatus
  } | null>(null)

  const fetchLog = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [outgoingResult, incomingResult, logResult] = await Promise.all([
        ahead > 0 ? window.electronAPI.gitOutgoingCommits(cwd) : Promise.resolve([]),
        behind > 0 ? window.electronAPI.gitIncomingCommits(cwd) : Promise.resolve([]),
        window.electronAPI.gitLog(cwd, 100)
      ])

      setOutgoing(outgoingResult)
      setIncoming(incomingResult)

      // Filter out outgoing commits from the full log to avoid duplicates
      const outgoingHashes = new Set(outgoingResult.map((c) => c.hash))
      setHistory(logResult.filter((c) => !outgoingHashes.has(c.hash)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [cwd, ahead, behind])

  useEffect(() => {
    fetchLog()
  }, [fetchLog])

  // Width override for diff view
  useEffect(() => {
    if (diffFile) {
      const currentWidth = useSessionStore.getState().fileTreeWidth
      setFileTreeWidthOverride(Math.max(currentWidth, Math.floor(window.innerWidth * 0.5)))
    } else {
      setFileTreeWidthOverride(null)
    }
  }, [diffFile, setFileTreeWidthOverride])

  useEffect(() => {
    return () => setFileTreeWidthOverride(null)
  }, [setFileTreeWidthOverride])

  const handlePush = useCallback(async () => {
    setOperating(true)
    setError(null)
    try {
      await window.electronAPI.gitPush(cwd)
      await fetchLog()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOperating(false)
    }
  }, [cwd, fetchLog])

  const handlePull = useCallback(async () => {
    setOperating(true)
    setError(null)
    try {
      await window.electronAPI.gitPull(cwd, 'auto')
      await fetchLog()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOperating(false)
    }
  }, [cwd, fetchLog])

  const toggleCommit = useCallback(
    (hash: string) => {
      setExpandedHash((prev) => (prev === hash ? null : hash))
    },
    []
  )

  // Diff view takes over the panel
  if (diffFile) {
    return (
      <CommitDiffView
        cwd={cwd}
        hash={diffFile.hash}
        filePath={diffFile.file.path}
        fileStatus={diffFile.file.status}
        onBack={() => setDiffFile(null)}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-text-tertiary">Loading history...</span>
      </div>
    )
  }

  const hasOutgoing = outgoing.length > 0
  const hasIncoming = incoming.length > 0
  const hasSections = hasOutgoing || hasIncoming

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {error && (
        <div className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs flex-shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Outgoing commits */}
        {hasOutgoing && (
          <>
            <LogSectionHeader
              label="Outgoing"
              count={outgoing.length}
              color="text-green-400"
              action={`\u2191 Push`}
              onAction={handlePush}
              actionDisabled={operating}
            />
            {outgoing.map((commit) => (
              <div key={commit.hash}>
                <CommitRow
                  commit={commit}
                  isExpanded={expandedHash === commit.hash}
                  onClick={() => toggleCommit(commit.hash)}
                  variant="outgoing"
                />
                {expandedHash === commit.hash && (
                  <CommitDetail
                    cwd={cwd}
                    commit={commit}
                    onSelectFile={(file) =>
                      setDiffFile({ hash: commit.hash, file })
                    }
                    onClose={() => setExpandedHash(null)}
                  />
                )}
              </div>
            ))}
          </>
        )}

        {/* Incoming commits */}
        {hasIncoming && (
          <>
            {hasOutgoing && <SyncDivider label={`origin/${branch}`} />}
            <LogSectionHeader
              label="Incoming"
              count={incoming.length}
              color="text-orange-400"
              action={`\u2193 Pull`}
              onAction={handlePull}
              actionDisabled={operating}
            />
            {incoming.map((commit) => (
              <div key={commit.hash}>
                <CommitRow
                  commit={commit}
                  isExpanded={expandedHash === commit.hash}
                  onClick={() => toggleCommit(commit.hash)}
                  variant="incoming"
                />
                {expandedHash === commit.hash && (
                  <CommitDetail
                    cwd={cwd}
                    commit={commit}
                    onSelectFile={(file) =>
                      setDiffFile({ hash: commit.hash, file })
                    }
                    onClose={() => setExpandedHash(null)}
                  />
                )}
              </div>
            ))}
          </>
        )}

        {/* Synced history */}
        {hasSections && <SyncDivider label="history" />}
        {history.map((commit) => (
          <div key={commit.hash}>
            <CommitRow
              commit={commit}
              isExpanded={expandedHash === commit.hash}
              onClick={() => toggleCommit(commit.hash)}
              variant="normal"
            />
            {expandedHash === commit.hash && (
              <CommitDetail
                cwd={cwd}
                commit={commit}
                onSelectFile={(file) =>
                  setDiffFile({ hash: commit.hash, file })
                }
                onClose={() => setExpandedHash(null)}
              />
            )}
          </div>
        ))}

        {!hasOutgoing && !hasIncoming && history.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-8">
            <span className="text-xs text-text-tertiary">No commit history</span>
          </div>
        )}
      </div>
    </div>
  )
}
