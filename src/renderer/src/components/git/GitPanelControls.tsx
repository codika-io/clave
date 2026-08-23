import { useState, useCallback, useEffect } from 'react'
import { useSessionStore } from '../../store/session-store'
import { ListBulletIcon, Bars3BottomLeftIcon, ArrowPathIcon, ArrowDownIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/24/outline'
import { IconButton } from '../ui/tooltip'
import type { MagicSyncStep, MagicPullStep } from '../../../../preload/index.d'

// ---------------------------------------------------------------------------
// Sync badges — the ↓ / ↑ / + counters that toggle a repo's sections open
// ---------------------------------------------------------------------------

export type GitSyncTone = 'incoming' | 'outgoing' | 'changes'

/** One text color per tone — the badge derives its border and fill from it. */
const TONE_TEXT_CLASS: Record<GitSyncTone, string> = {
  incoming: 'text-orange-400',
  outgoing: 'text-green-400',
  changes: 'text-text-secondary'
}

/**
 * A counter that opens and closes the matching section of a repo's content.
 * Rendered as a span with a button role because a repo row is itself a
 * <button> and buttons cannot nest.
 */
export function GitSyncBadge({
  tone,
  count,
  active,
  onToggle,
  title
}: {
  tone: GitSyncTone
  count: number
  active: boolean
  onToggle: (e: React.MouseEvent) => void
  title: string
}): React.JSX.Element {
  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      aria-pressed={active}
      onClick={onToggle}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(e as unknown as React.MouseEvent)
        }
      }}
      className={`git-sync-badge ${TONE_TEXT_CLASS[tone]} ${active ? 'git-sync-badge-on' : ''}`}
    >
      {tone === 'changes' ? (
        <PlusIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
      ) : (
        <span aria-hidden>{tone === 'incoming' ? '↓' : '↑'}</span>
      )}
      {count}
    </span>
  )
}

/**
 * The Pull / Push button that sits at the right of an Incoming / Outgoing
 * header. Spelled out rather than an arrow: this one syncs, and a click that
 * syncs must say so.
 */
export function GitSyncActionButton({
  tone,
  label,
  title,
  disabled,
  onClick
}: {
  tone: 'incoming' | 'outgoing'
  label: string
  title: string
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className={`git-sync-action ${TONE_TEXT_CLASS[tone]}`}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <span aria-hidden>{tone === 'incoming' ? '↓' : '↑'}</span>
      {label}
    </button>
  )
}

export function SectionHeader({
  label,
  count,
  action,
  onAction,
  discardAction,
  onDiscardAction,
  trailing,
  disabled,
  indentPx
}: {
  label: string
  count: number
  action?: string
  onAction?: () => void
  discardAction?: string
  onDiscardAction?: () => void
  /** Rightmost slot — the sync sections put their Pull / Push button here. */
  trailing?: React.ReactNode
  disabled?: boolean
  /** Left offset in px — lets the header sit at its tree depth (default 12 = px-3). */
  indentPx?: number
}) {
  return (
    <div className="flex items-center pr-3 py-1.5" style={{ paddingLeft: indentPx ?? 12 }}>
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
        {trailing}
      </span>
    </div>
  )
}

export function CollapseAllButton() {
  const triggerCollapseAll = useSessionStore((s) => s.triggerCollapseAll)
  return (
    <IconButton
      onClick={triggerCollapseAll}
      className="btn-icon btn-icon-sm flex-shrink-0"
      tooltip="Collapse all"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 8l4-3 4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 5l4-3 4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IconButton>
  )
}

export function ViewModeToggle() {
  const gitViewMode = useSessionStore((s) => s.gitViewMode)
  const setGitViewMode = useSessionStore((s) => s.setGitViewMode)
  const isTree = gitViewMode === 'tree'
  return (
    <IconButton
      onClick={() => setGitViewMode(isTree ? 'list' : 'tree')}
      className="btn-icon btn-icon-sm flex-shrink-0"
      tooltip={isTree ? 'List view' : 'Tree view'}
    >
      {isTree ? (
        <ListBulletIcon className="w-3 h-3" />
      ) : (
        <Bars3BottomLeftIcon className="w-3 h-3" />
      )}
    </IconButton>
  )
}

export function CommitBarToggle(): React.JSX.Element {
  const gitShowCommitBar = useSessionStore((s) => s.gitShowCommitBar)
  const setGitShowCommitBar = useSessionStore((s) => s.setGitShowCommitBar)
  return (
    <IconButton
      onClick={() => setGitShowCommitBar(!gitShowCommitBar)}
      className={`btn-icon btn-icon-sm flex-shrink-0 ${gitShowCommitBar ? 'text-accent' : ''}`}
      tooltip={gitShowCommitBar ? 'Hide commit bar' : 'Show commit bar'}
    >
      <PencilSquareIcon className="w-3 h-3" />
    </IconButton>
  )
}

export function PanelModeToggle() {
  const gitPanelMode = useSessionStore((s) => s.gitPanelMode)
  const setGitPanelMode = useSessionStore((s) => s.setGitPanelMode)
  const isLog = gitPanelMode === 'log'
  return (
    <IconButton
      onClick={() => setGitPanelMode(isLog ? 'changes' : 'log')}
      className="btn-icon btn-icon-sm flex-shrink-0"
      tooltip={isLog ? 'Changes' : 'Commit log'}
    >
      {isLog ? (
        /* Changes/diff icon */
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 3h8M2 6h5M2 9h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ) : (
        /* Log/history icon */
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 3.5V6l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </IconButton>
  )
}

const STEP_LABELS: Record<MagicSyncStep, string> = {
  pulling: 'Pulling',
  staging: 'Staging',
  generating: 'Generating message',
  committing: 'Committing',
  pushing: 'Pushing'
}

export function MagicSyncButton({
  repoPaths,
  onDone
}: {
  repoPaths: string[]
  onDone?: () => void
}) {
  const [syncing, setSyncing] = useState(false)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  // Listen for progress events
  useEffect(() => {
    if (!syncing) return
    const cleanup = window.electronAPI.onMagicSyncProgress((_repoPath, step) => {
      setCurrentStep(STEP_LABELS[step as MagicSyncStep] ?? step)
    })
    return cleanup
  }, [syncing])

  // Auto-clear result message
  useEffect(() => {
    if (!resultMessage) return
    const timer = setTimeout(() => setResultMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [resultMessage])

  const handleSync = useCallback(async () => {
    if (syncing || repoPaths.length === 0) return
    setSyncing(true)
    setCurrentStep(null)
    setResultMessage(null)
    try {
      const results = await window.electronAPI.gitMagicSync(repoPaths)
      const synced = results.filter((r) => r.actions.length > 0 && !r.error)
      const errors = results.filter((r) => r.error)
      const skipped = results.filter((r) => r.actions.length === 0 && !r.error)

      const parts: string[] = []
      if (synced.length > 0) parts.push(`${synced.length} synced`)
      if (skipped.length > 0) parts.push(`${skipped.length} clean`)
      if (errors.length > 0) parts.push(`${errors.length} failed`)
      setResultMessage(parts.join(', '))
    } catch (err) {
      setResultMessage('Sync failed')
      console.error('[magic-sync]', err)
    } finally {
      setSyncing(false)
      setCurrentStep(null)
      onDone?.()
    }
  }, [syncing, repoPaths, onDone])

  return (
    <div className="relative flex items-center">
      <IconButton
        onClick={handleSync}
        disabled={syncing || repoPaths.length === 0}
        className="btn-icon btn-icon-sm flex-shrink-0 disabled:opacity-40"
        tooltip={syncing ? (currentStep ?? 'Syncing...') : 'Magic sync'}
      >
        <ArrowPathIcon className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
      </IconButton>
      {(syncing || resultMessage) && (
        <span className="ml-1 text-[10px] text-text-tertiary whitespace-nowrap">
          {syncing ? (currentStep ?? 'Syncing...') : resultMessage}
        </span>
      )}
    </div>
  )
}

const PULL_STEP_LABELS: Record<MagicPullStep, string> = {
  fetching: 'Fetching',
  pulling: 'Pulling'
}

export function MagicPullButton({
  repoPaths,
  onDone
}: {
  repoPaths: string[]
  onDone?: () => void
}) {
  const [pulling, setPulling] = useState(false)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!pulling) return
    const cleanup = window.electronAPI.onMagicPullProgress((_repoPath, step) => {
      setCurrentStep(PULL_STEP_LABELS[step as MagicPullStep] ?? step)
    })
    return cleanup
  }, [pulling])

  useEffect(() => {
    if (!resultMessage) return
    const timer = setTimeout(() => setResultMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [resultMessage])

  const handlePull = useCallback(async () => {
    if (pulling || repoPaths.length === 0) return
    setPulling(true)
    setCurrentStep(null)
    setResultMessage(null)
    try {
      const results = await window.electronAPI.gitMagicPull(repoPaths)
      const pulled = results.filter((r) => r.pulled && !r.error)
      const upToDate = results.filter((r) => !r.pulled && !r.error)
      const errors = results.filter((r) => r.error)

      const parts: string[] = []
      if (pulled.length > 0) parts.push(`${pulled.length} pulled`)
      if (upToDate.length > 0) parts.push(`${upToDate.length} up to date`)
      if (errors.length > 0) parts.push(`${errors.length} failed`)
      setResultMessage(parts.join(', '))
    } catch (err) {
      setResultMessage('Pull failed')
      console.error('[magic-pull]', err)
    } finally {
      setPulling(false)
      setCurrentStep(null)
      onDone?.()
    }
  }, [pulling, repoPaths, onDone])

  return (
    <div className="relative flex items-center">
      <IconButton
        onClick={handlePull}
        disabled={pulling || repoPaths.length === 0}
        className="btn-icon btn-icon-sm flex-shrink-0 disabled:opacity-40"
        tooltip={pulling ? (currentStep ?? 'Pulling...') : 'Pull all'}
      >
        <ArrowDownIcon className={`w-3 h-3 ${pulling ? 'animate-bounce' : ''}`} />
      </IconButton>
      {(pulling || resultMessage) && (
        <span className="ml-1 text-[10px] text-text-tertiary whitespace-nowrap">
          {pulling ? (currentStep ?? 'Pulling...') : resultMessage}
        </span>
      )}
    </div>
  )
}

export function BranchHeader({
  branch,
  ahead,
  behind,
  cwd,
  repoName,
  onSyncDone
}: {
  branch: string
  ahead: number
  behind: number
  cwd?: string | null
  repoName?: string
  onSyncDone?: () => void
}) {
  const gitPanelMode = useSessionStore((s) => s.gitPanelMode)
  return (
    <div className="flex flex-col border-b border-border-subtle flex-shrink-0">
      {/* Row 1: Branch info */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
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
      {/* Row 2: Toolbar controls */}
      <div className="flex items-center gap-1 px-3 py-1 border-t border-border-subtle/50">
        {cwd && <MagicPullButton repoPaths={[cwd]} onDone={onSyncDone} />}
        {cwd && <MagicSyncButton repoPaths={[cwd]} onDone={onSyncDone} />}
        <span className="flex-1" />
        {cwd && <JourneyButton cwd={cwd} repoName={repoName || branch} />}
        <PanelModeToggle />
        {gitPanelMode === 'changes' && <ViewModeToggle />}
        <CollapseAllButton />
      </div>
    </div>
  )
}

export function JourneyButton({ cwd, repoName }: { cwd: string; repoName: string }) {
  const openJourneyPanel = useSessionStore((s) => s.openJourneyPanel)
  return (
    <IconButton
      onClick={() => openJourneyPanel(cwd, repoName)}
      className="btn-icon btn-icon-sm flex-shrink-0"
      tooltip="Journey"
    >
      {/* Timeline/route icon */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="3" cy="2.5" r="1.3" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="9" cy="6" r="1.3" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="3" cy="9.5" r="1.3" stroke="currentColor" strokeWidth="1.1" />
        <path d="M3 3.8v4.4M4.3 2.8l3.4 2.5M7.7 6.7l-3.4 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </IconButton>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs flex-shrink-0">{message}</div>
  )
}
