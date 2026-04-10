// src/renderer/src/components/work-tracker/WorkTrackerExpanded.tsx
import { ChartBarIcon } from '@heroicons/react/24/outline'
import { useWorkTrackerStore } from '../../store/work-tracker-store'
import { useSessionStore } from '../../store/session-store'
import { cn } from '../../lib/utils'
import { formatDuration } from './utils'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5">
      {children}
    </div>
  )
}

export function WorkTrackerExpanded() {
  const todayProjects = useWorkTrackerStore((s) => s.todayProjects)
  const currentStreakStartedAt = useWorkTrackerStore((s) => s.currentStreakStartedAt)
  const breakSuggestion = useWorkTrackerStore((s) => s.breakSuggestion)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const toggleExpanded = useWorkTrackerStore((s) => s.toggleExpanded)

  const streakMinutes = currentStreakStartedAt
    ? Math.round((Date.now() - currentStreakStartedAt) / 60000)
    : 0

  const streakPercent = Math.min((streakMinutes / 240) * 100, 100)

  return (
    <div>
      {/* Today's Breakdown */}
      <div className="px-3 py-2.5 border-b border-border-subtle">
        <SectionLabel>Today</SectionLabel>
        {todayProjects.length > 0 ? (
          todayProjects.map((project) => (
            <div key={project.projectPath} className="flex justify-between py-0.5">
              <span className="text-[12px] text-text-secondary truncate mr-2">
                {project.projectName}
              </span>
              <span className="text-[12px] text-text-tertiary flex-shrink-0">
                {formatDuration(project.totalMinutes)}
              </span>
            </div>
          ))
        ) : (
          <div className="text-[12px] text-text-tertiary">No activity yet</div>
        )}
      </div>

      {/* Current Streak */}
      {streakMinutes > 0 && (
        <div className="px-3 py-2.5 border-b border-border-subtle">
          <SectionLabel>Current streak</SectionLabel>
          <span
            className={cn(
              'text-[13px] font-semibold',
              breakSuggestion === 'strong'
                ? 'text-wellbeing-strong'
                : breakSuggestion === 'gentle'
                  ? 'text-wellbeing-gentle'
                  : 'text-text-primary'
            )}
          >
            {formatDuration(streakMinutes)} active
          </span>
          <div className="mt-1.5 h-1 bg-surface-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${streakPercent}%`,
                background:
                  breakSuggestion === 'strong'
                    ? 'var(--color-wellbeing-strong)'
                    : breakSuggestion === 'gentle'
                      ? 'var(--color-wellbeing-gentle)'
                      : 'var(--color-accent)'
              }}
            />
          </div>
          {breakSuggestion !== 'none' && (
            <div
              className={cn(
                'text-[11px] mt-1',
                breakSuggestion === 'strong' ? 'text-wellbeing-strong' : 'text-wellbeing-gentle'
              )}
            >
              {breakSuggestion === 'strong' ? 'You should take a break' : 'Consider a break'}
            </div>
          )}
        </div>
      )}

      {/* Link to full usage page */}
      <button
        onClick={() => {
          setActiveView('usage')
          toggleExpanded()
        }}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-text-tertiary hover:text-accent transition-colors"
      >
        <ChartBarIcon className="w-3.5 h-3.5" />
        <span>See full usage</span>
      </button>
    </div>
  )
}
