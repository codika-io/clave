import { useSessionStore, type LayoutMode } from '../../store/session-store'
import { cn } from '../../lib/utils'

const layouts: { mode: LayoutMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'single',
    label: 'Single',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  },
  {
    mode: 'split-2',
    label: 'Split',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  },
  {
    mode: 'grid-4',
    label: 'Grid',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" />
        <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  }
]

export function LayoutSwitcher() {
  const layoutMode = useSessionStore((s) => s.layoutMode)
  const setLayoutMode = useSessionStore((s) => s.setLayoutMode)

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-100">
      {layouts.map(({ mode, label, icon }) => (
        <button
          key={mode}
          onClick={() => setLayoutMode(mode)}
          title={label}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            layoutMode === mode
              ? 'bg-surface-300 text-text-primary'
              : 'text-text-tertiary hover:text-text-secondary'
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}
