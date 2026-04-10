import { ClockIcon } from '@heroicons/react/24/outline'
import { useWorkTrackerStore } from '../../store/work-tracker-store'
import { useSessionStore } from '../../store/session-store'
import { cn } from '../../lib/utils'
import { formatDuration } from './utils'

export function WorkTracker() {
  const enabled = useWorkTrackerStore((s) => s.enabled)
  const todayTotalMinutes = useWorkTrackerStore((s) => s.todayTotalMinutes)
  const todaySessionCount = useWorkTrackerStore((s) => s.todaySessionCount)
  const breakSuggestion = useWorkTrackerStore((s) => s.breakSuggestion)
  const setActiveView = useSessionStore((s) => s.setActiveView)

  if (!enabled) return null

  const isGentle = breakSuggestion === 'gentle'
  const isStrong = breakSuggestion === 'strong'
  const hasBreak = isGentle || isStrong
  const hasActivity = todayTotalMinutes > 0

  const sessionText = hasBreak
    ? isStrong
      ? 'take a break'
      : 'break?'
    : `${todaySessionCount} session${todaySessionCount !== 1 ? 's' : ''}`

  return (
    <button
      onClick={() => setActiveView('usage')}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-2 rounded-xl transition-colors text-left',
        hasBreak
          ? isStrong
            ? 'bg-wellbeing-strong-bg'
            : 'bg-wellbeing-gentle-bg'
          : 'hover:bg-surface-100'
      )}
    >
      <ClockIcon
        className={cn(
          'w-3.5 h-3.5 flex-shrink-0',
          hasBreak
            ? isStrong
              ? 'text-wellbeing-strong'
              : 'text-wellbeing-gentle'
            : hasActivity
              ? 'text-accent'
              : 'text-text-tertiary'
        )}
      />
      <span
        className={cn(
          'text-[13px] font-semibold',
          hasBreak
            ? isStrong
              ? 'text-wellbeing-strong'
              : 'text-wellbeing-gentle'
            : hasActivity
              ? 'text-accent'
              : 'text-text-tertiary'
        )}
      >
        {formatDuration(todayTotalMinutes)}
      </span>
      <span className="text-[11px] text-text-tertiary">·</span>
      <span className="text-[11px] text-text-tertiary flex-1 truncate">
        {sessionText}
      </span>
    </button>
  )
}
