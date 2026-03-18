import { useSessionStore } from '../../store/session-store'
import { ListBulletIcon, Bars3BottomLeftIcon } from '@heroicons/react/24/outline'

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

export function BranchHeader({
  branch,
  ahead,
  behind
}: {
  branch: string
  ahead: number
  behind: number
}) {
  const gitPanelMode = useSessionStore((s) => s.gitPanelMode)
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
        <PanelModeToggle />
        {gitPanelMode === 'changes' && <ViewModeToggle />}
      </span>
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs flex-shrink-0">{message}</div>
  )
}
