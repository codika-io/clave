import { useState, useCallback, useEffect } from 'react'
import { useSessionStore } from '../../store/session-store'
import { ListBulletIcon, Bars3BottomLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import type { MagicSyncStep } from '../../../../preload/index.d'

export function SectionHeader({
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

export function CollapseAllButton() {
  const triggerCollapseAll = useSessionStore((s) => s.triggerCollapseAll)
  return (
    <button
      onClick={triggerCollapseAll}
      className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-200 transition-colors flex-shrink-0"
      title="Collapse all"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 8l4-3 4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 5l4-3 4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export function ViewModeToggle() {
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

export function PanelModeToggle() {
  const gitPanelMode = useSessionStore((s) => s.gitPanelMode)
  const setGitPanelMode = useSessionStore((s) => s.setGitPanelMode)
  return (
    <div className="flex items-center gap-0.5 text-[10px] font-medium">
      <button
        className={`px-1 py-0.5 rounded transition-colors ${
          gitPanelMode === 'changes'
            ? 'text-text-primary'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        onClick={() => setGitPanelMode('changes')}
      >
        Changes
      </button>
      <span className="text-text-tertiary/50">|</span>
      <button
        className={`px-1 py-0.5 rounded transition-colors ${
          gitPanelMode === 'log'
            ? 'text-text-primary'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        onClick={() => setGitPanelMode('log')}
      >
        Log
      </button>
    </div>
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
      <button
        onClick={handleSync}
        disabled={syncing || repoPaths.length === 0}
        className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-200 transition-colors flex-shrink-0 disabled:opacity-40"
        title={syncing ? (currentStep ?? 'Syncing...') : 'Magic Sync — pull, commit & push all repos'}
      >
        <ArrowPathIcon className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
      </button>
      {(syncing || resultMessage) && (
        <span className="ml-1 text-[10px] text-text-tertiary whitespace-nowrap">
          {syncing ? (currentStep ?? 'Syncing...') : resultMessage}
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
  onSyncDone
}: {
  branch: string
  ahead: number
  behind: number
  cwd?: string | null
  onSyncDone?: () => void
}) {
  const gitPanelMode = useSessionStore((s) => s.gitPanelMode)
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border-subtle text-xs flex-shrink-0">
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
      <span className="ml-auto flex-shrink-0 flex items-center gap-0.5">
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
        {cwd && <MagicSyncButton repoPaths={[cwd]} onDone={onSyncDone} />}
        <PanelModeToggle />
        {gitPanelMode === 'changes' && <ViewModeToggle />}
        <CollapseAllButton />
      </span>
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs flex-shrink-0">{message}</div>
  )
}
