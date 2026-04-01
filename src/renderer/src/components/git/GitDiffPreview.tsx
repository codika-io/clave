import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react'
import { motion } from 'framer-motion'
import { useSessionStore } from '../../store/session-store'
import { parseDiffLines } from '../../lib/diff-utils'
import { CloseIcon, fileActionButtonClass } from '../files/FileActionIcons'

function commitFileStatusColor(status: string): string {
  switch (status) {
    case 'A':
    case 'added':
    case 'untracked':
      return 'text-green-400'
    case 'M':
    case 'T':
    case 'modified':
      return 'text-orange-400'
    case 'D':
    case 'deleted':
      return 'text-red-400'
    case 'R':
    case 'C':
    case 'renamed':
    case 'copied':
      return 'text-blue-400'
    default:
      return 'text-text-tertiary'
  }
}

function statusDisplayLetter(status: string): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'A'
    case 'modified':
      return 'M'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'copied':
      return 'C'
    default:
      return status.charAt(0).toUpperCase()
  }
}

export function GitDiffPreview() {
  const diffPreview = useSessionStore((s) => s.diffPreview)
  const setDiffPreview = useSessionStore((s) => s.setDiffPreview)
  const triggerGitRefresh = useSessionStore((s) => s.triggerGitRefresh)
  const fileTreeOpen = useSessionStore((s) => s.fileTreeOpen)
  const fileTreeWidth = useSessionStore((s) => s.fileTreeWidth)
  const journeyPanel = useSessionStore((s) => s.journeyPanel)

  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [operating, setOperating] = useState(false)

  const close = useCallback(() => setDiffPreview(null), [setDiffPreview])

  // Fetch diff
  useEffect(() => {
    if (!diffPreview) {
      setDiff(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const fetch = async (): Promise<void> => {
      try {
        let result: string
        if (diffPreview.type === 'commit' && diffPreview.hash) {
          result = await window.electronAPI.gitCommitDiff(
            diffPreview.cwd,
            diffPreview.hash,
            diffPreview.file
          )
        } else {
          const isUntracked = diffPreview.fileStatus === 'untracked'
          result = await window.electronAPI.gitDiff(
            diffPreview.cwd,
            diffPreview.file,
            diffPreview.staged,
            isUntracked
          )
        }
        if (!cancelled) setDiff(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()

    return () => {
      cancelled = true
    }
  }, [diffPreview?.file, diffPreview?.cwd, diffPreview?.type, diffPreview?.hash, diffPreview?.staged, diffPreview?.fileStatus])

  // Keyboard
  useEffect(() => {
    if (!diffPreview) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && diffPreview.siblings?.length) {
        e.preventDefault()
        const siblings = diffPreview.siblings
        const currentIndex = siblings.findIndex((s) => s.file === diffPreview.file)
        if (currentIndex === -1) return

        const nextIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1
        if (nextIndex < 0 || nextIndex >= siblings.length) return

        const next = siblings[nextIndex]
        setDiffPreview({
          ...diffPreview,
          file: next.file,
          staged: next.staged,
          fileStatus: next.fileStatus
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [diffPreview, close, setDiffPreview])

  const diffLines = useMemo(() => {
    if (diff === null) return []
    const isUntracked = diffPreview?.fileStatus === 'untracked'
    const isNewFile = diffPreview?.fileStatus === 'A' || diffPreview?.fileStatus === 'added'
    if (isUntracked || (isNewFile && !diff.includes('@@'))) {
      return diff.split('\n').map((line) => ({ type: 'add' as const, content: line }))
    }
    return parseDiffLines(diff)
  }, [diff, diffPreview?.fileStatus])

  const stats = useMemo(() => {
    let additions = 0
    let deletions = 0
    for (const line of diffLines) {
      if (line.type === 'add') additions++
      else if (line.type === 'del') deletions++
    }
    return { additions, deletions }
  }, [diffLines])

  const handleStageToggle = useCallback(async () => {
    if (!diffPreview || diffPreview.type !== 'working' || operating) return
    setOperating(true)
    try {
      if (diffPreview.staged) {
        await window.electronAPI.gitUnstage(diffPreview.cwd, [diffPreview.file])
      } else {
        await window.electronAPI.gitStage(diffPreview.cwd, [diffPreview.file])
      }
      triggerGitRefresh()
      // Update the preview to reflect new staged state
      setDiffPreview({ ...diffPreview, staged: !diffPreview.staged })
    } catch {
      // silently ignore
    } finally {
      setOperating(false)
    }
  }, [diffPreview, operating, triggerGitRefresh, setDiffPreview])

  // Measure panel height and compute top position based on clickY
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelTop, setPanelTop] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!diffPreview || !panelRef.current) return
    const clickY = diffPreview.clickY
    if (clickY == null) {
      setPanelTop(null)
      return
    }
    const vh = window.innerHeight
    const panelHeight = panelRef.current.offsetHeight
    const padding = 16
    // Center the panel on the click position
    let top = clickY - panelHeight / 2
    // Clamp within viewport
    top = Math.max(padding, Math.min(top, vh - panelHeight - padding))
    setPanelTop(top)
  })

  if (!diffPreview) return null

  const filename = diffPreview.file.split('/').pop() ?? ''
  const baseRight = fileTreeOpen ? fileTreeWidth + 8 : 16
  const rightOffset = journeyPanel ? baseRight + 480 + 8 : baseRight
  const panelWidth = 520

  return (
    <>
      {/* Click-outside backdrop */}
      <div className="fixed inset-0 z-40" onClick={close} />

      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
        className="fixed z-50 bg-surface-50 border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          right: rightOffset,
          top: panelTop != null ? panelTop : '4%',
          maxHeight: '92vh',
          width: panelWidth
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle flex-shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className={`font-mono text-xs flex-shrink-0 ${commitFileStatusColor(diffPreview.fileStatus)}`}>
              {statusDisplayLetter(diffPreview.fileStatus)}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">
                {filename}
              </div>
              {diffPreview.file !== filename && (
                <div className="text-xs text-text-tertiary truncate">{diffPreview.file}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {diffPreview.type === 'working' && (
              <button
                onClick={handleStageToggle}
                disabled={operating}
                className="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors disabled:opacity-40"
              >
                {diffPreview.staged ? 'Unstage' : 'Stage'}
              </button>
            )}
            {diffPreview.type === 'commit' && diffPreview.hash && (
              <span className="text-[10px] text-text-tertiary font-mono">
                {diffPreview.hash.slice(0, 7)}
              </span>
            )}
            <button onClick={close} className={fileActionButtonClass}>
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto font-mono text-[11px] leading-[18px] min-h-0">
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

        {/* Footer */}
        {!loading && !error && diffLines.length > 0 && (
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-subtle text-[10px] text-text-tertiary flex-shrink-0">
            <span className="flex items-center gap-2">
              {diffPreview.siblings && diffPreview.siblings.length > 1 && (
                <span>{diffPreview.siblings.findIndex((s) => s.file === diffPreview.file) + 1}/{diffPreview.siblings.length}</span>
              )}
              <span>{diffLines.length} lines</span>
            </span>
            <span>
              {stats.additions > 0 && <span className="text-green-400">+{stats.additions}</span>}
              {stats.additions > 0 && stats.deletions > 0 && ' '}
              {stats.deletions > 0 && <span className="text-red-400">-{stats.deletions}</span>}
            </span>
          </div>
        )}
      </motion.div>
    </>
  )
}
