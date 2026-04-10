// src/renderer/src/components/work-tracker/WeeklyChart.tsx
import { cn } from '../../lib/utils'
import { formatDuration } from './utils'

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface WeeklyChartProps {
  dailyMinutes: number[]
  avgDailyMinutes: number
}

export function WeeklyChart({ dailyMinutes, avgDailyMinutes }: WeeklyChartProps) {
  const max = Math.max(...dailyMinutes, 1)
  const todayIndex = (new Date().getDay() + 6) % 7 // 0=Mon

  return (
    <div>
      <div className="flex items-end gap-1 h-8 mb-1">
        {dailyMinutes.map((minutes, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 rounded-sm min-h-[2px] transition-all',
              i === todayIndex ? 'bg-accent' : minutes > 0 ? 'bg-surface-400' : 'bg-surface-200'
            )}
            style={{ height: `${Math.max((minutes / max) * 100, 6)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        {DAY_LABELS.map((label, i) => (
          <span
            key={i}
            className={cn(
              'text-[9px] flex-1 text-center',
              i === todayIndex ? 'text-accent' : 'text-text-tertiary'
            )}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-text-tertiary">
        Avg {formatDuration(avgDailyMinutes)}/day
      </div>
    </div>
  )
}
