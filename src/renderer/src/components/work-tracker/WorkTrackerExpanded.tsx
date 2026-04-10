// src/renderer/src/components/work-tracker/WorkTrackerExpanded.tsx
import { useWorkTrackerStore } from '../../store/work-tracker-store'
import { WeeklyChart } from './WeeklyChart'
import { cn } from '../../lib/utils'
import { formatDuration } from './utils'

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

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
  const yesterdaySummary = useWorkTrackerStore((s) => s.yesterdaySummary)
  const weeklySummary = useWorkTrackerStore((s) => s.weeklySummary)
  const tokenUsage = useWorkTrackerStore((s) => s.tokenUsage)

  const streakMinutes = currentStreakStartedAt
    ? Math.round((Date.now() - currentStreakStartedAt) / 60000)
    : 0

  // Progress bar: fills toward 4h (240 min)
  const streakPercent = Math.min((streakMinutes / 240) * 100, 100)

  return (
    <div className="max-h-[320px] overflow-y-auto">
      {/* Today's Breakdown */}
      {todayProjects.length > 0 && (
        <div className="px-3 py-2.5 border-b border-border-subtle">
          <SectionLabel>Today</SectionLabel>
          {todayProjects.map((project) => (
            <div key={project.projectPath} className="flex justify-between py-0.5">
              <span className="text-[12px] text-text-secondary truncate mr-2">
                {project.projectName}
              </span>
              <span className="text-[12px] text-text-tertiary flex-shrink-0">
                {formatDuration(project.totalMinutes)}
              </span>
            </div>
          ))}
        </div>
      )}

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

      {/* Yesterday */}
      {yesterdaySummary && (
        <div className="px-3 py-2.5 border-b border-border-subtle">
          <SectionLabel>Yesterday</SectionLabel>
          <div className="text-[12px] text-text-tertiary">
            {formatDuration(yesterdaySummary.totalMinutes)} · {yesterdaySummary.sessionCount} session{yesterdaySummary.sessionCount !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Weekly Trends */}
      {weeklySummary && (
        <div className="px-3 py-2.5 border-b border-border-subtle">
          <SectionLabel>This week</SectionLabel>
          <WeeklyChart
            dailyMinutes={weeklySummary.dailyMinutes}
            avgDailyMinutes={weeklySummary.avgDailyMinutes}
          />
        </div>
      )}

      {/* Token Usage */}
      {tokenUsage && (tokenUsage.todayTokens > 0 || tokenUsage.weekTokens > 0) && (
        <div className="px-3 py-2.5">
          <SectionLabel>Tokens</SectionLabel>
          {tokenUsage.todayTokens > 0 && (
            <div className="flex justify-between text-[12px]">
              <span className="text-text-secondary">Today</span>
              <span className="text-text-tertiary">
                {formatTokens(tokenUsage.todayTokens)} · ~${tokenUsage.todayCost.toFixed(2)}
              </span>
            </div>
          )}
          {tokenUsage.weekTokens > 0 && (
            <div className="flex justify-between text-[12px] mt-0.5">
              <span className="text-text-secondary">Week</span>
              <span className="text-text-tertiary">
                {formatTokens(tokenUsage.weekTokens)} · ~${tokenUsage.weekCost.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
