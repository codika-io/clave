import { useEffect, useMemo, useState } from 'react'
import { statusLetter, statusColor } from './git-status-utils'
import type { GitFileStatus } from '../../../../preload/index.d'

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

export function GitDiffView({
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
