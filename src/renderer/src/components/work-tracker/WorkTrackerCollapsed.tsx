// src/renderer/src/components/work-tracker/WorkTrackerCollapsed.tsx
import { ClockIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { useWorkTrackerStore } from '../../store/work-tracker-store'
import { cn } from '../../lib/utils'

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function WorkTrackerCollapsed() {
  const todayTotalMinutes = useWorkTrackerStore((s) => s.todayTotalMinutes)
  const todaySessionCount = useWorkTrackerStore((s) => s.todaySessionCount)
  const breakSuggestion = useWorkTrackerStore((s) => s.breakSuggestion)
  const isExpanded = useWorkTrackerStore((s) => s.isExpanded)
  const toggleExpanded = useWorkTrackerStore((s) => s.toggleExpanded)

  const isGentle = breakSuggestion === 'gentle'
  const isStrong = breakSuggestion === 'strong'
  const hasBreak = isGentle || isStrong

  return (
    <button
      onClick={toggleExpanded}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-left',
        hasBreak
          ? isStrong
            ? 'bg-wellbeing-strong-bg border border-wellbeing-strong-border'
            : 'bg-wellbeing-gentle-bg border border-wellbeing-gentle-border'
          : 'bg-surface-100 border border-border-subtle hover:bg-surface-200'
      )}
    >
      <ClockIcon
        className={cn(
          'w-3.5 h-3.5 flex-shrink-0',
          hasBreak
            ? isStrong
              ? 'text-wellbeing-strong'
              : 'text-wellbeing-gentle'
            : 'text-accent'
        )}
      />
      <span
        className={cn(
          'text-[13px] font-semibold',
          hasBreak
            ? isStrong
              ? 'text-wellbeing-strong'
              : 'text-wellbeing-gentle'
            : 'text-accent'
        )}
      >
        {formatDuration(todayTotalMinutes)}
      </span>
      <span className="text-[11px] text-text-tertiary">·</span>
      <span className="text-[11px] text-text-tertiary flex-1 truncate">
        {hasBreak ? (isStrong ? 'take a break' : 'break?') : `${todaySessionCount} session${todaySessionCount !== 1 ? 's' : ''}`}
      </span>
      {isExpanded ? (
        <ChevronDownIcon className="w-3 h-3 text-text-tertiary flex-shrink-0" />
      ) : (
        <ChevronUpIcon className="w-3 h-3 text-text-tertiary flex-shrink-0" />
      )}
    </button>
  )
}
