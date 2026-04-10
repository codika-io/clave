// src/renderer/src/components/assistant/AssistantPanel.tsx
import { useEffect } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  CommandLineIcon,
  ClockIcon,
  FolderIcon
} from '@heroicons/react/24/outline'
import { useAssistantStore } from '../../store/assistant-store'
import { useWorkTrackerStore } from '../../store/work-tracker-store'
import { formatDuration } from '../work-tracker/utils'

// CSS variable references for project heading colors
const PROJECT_COLOR_VARS = [
  'var(--journal-project-1)',
  'var(--journal-project-2)',
  'var(--journal-project-3)',
  'var(--journal-project-4)',
  'var(--journal-project-5)',
  'var(--journal-project-6)',
  'var(--journal-project-7)',
  'var(--journal-project-8)'
]

function formatArchiveDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

function StatsBar({
  totalSessions,
  projectCount,
  totalMinutes
}: {
  totalSessions: number
  projectCount: number
  totalMinutes: number
}): React.ReactNode {
  return (
    <div className="flex items-center gap-4 px-5 pb-3 text-xs text-text-tertiary">
      <span className="flex items-center gap-1.5">
        <ClockIcon className="w-3.5 h-3.5" />
        {formatDuration(totalMinutes)}
      </span>
      <span className="opacity-40">·</span>
      <span className="flex items-center gap-1.5">
        <CommandLineIcon className="w-3.5 h-3.5" />
        {totalSessions} session{totalSessions !== 1 ? 's' : ''}
      </span>
      <span className="opacity-40">·</span>
      <span className="flex items-center gap-1.5">
        <FolderIcon className="w-3.5 h-3.5" />
        {projectCount} project{projectCount !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

interface EntryItemProps {
  entry: {
    sessionId: string
    claudeSessionId?: string
    sessionName: string
    summary?: string
    startTime: number
    endTime?: number
    status: 'active' | 'completed'
  }
}

/** Parse a summary into headline + bullet lines */
function parseSummary(raw: string): { headline: string; bullets: string[] } {
  const clean = raw.replace(/<[^>]*>/g, '').trim()
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { headline: '', bullets: [] }

  // First non-bullet line is the headline
  const headline = lines[0].replace(/^[-•*]\s*/, '')
  const bullets = lines
    .slice(1)
    .filter((l) => /^[-•*]\s/.test(l))
    .map((l) => l.replace(/^[-•*]\s*/, ''))

  return { headline, bullets }
}

function EntryItem({ entry }: EntryItemProps): React.ReactNode {
  const displayText = entry.sessionName || 'Untitled session'

  const startStr = entry.startTime
    ? new Date(entry.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''
  const endStr = entry.endTime
    ? new Date(entry.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''

  const durationMs = entry.endTime && entry.startTime ? entry.endTime - entry.startTime : 0
  const durationMin = Math.round(durationMs / 60000)
  const durationStr =
    durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
      : durationMin > 0
        ? `${durationMin}m`
        : ''

  const isActive = entry.status === 'active'
  const { headline, bullets } = entry.summary
    ? parseSummary(entry.summary)
    : { headline: '', bullets: [] }
  const hasRichSummary = headline.length > 0

  return (
    <div className="py-2.5 border-b border-border-subtle last:border-b-0">
      {/* Metadata row: status + session name + time */}
      <div className="flex items-center gap-2 text-xs text-text-tertiary mb-1">
        {isActive ? (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
            style={{ backgroundColor: 'var(--journal-active-dot)' }}
          />
        ) : (
          <CheckCircleIcon className="w-3 h-3 flex-shrink-0" />
        )}
        <span className="truncate">{displayText}</span>
        <span className="ml-auto flex-shrink-0 flex items-center gap-0">
          <span>{startStr}</span>
          {endStr && (
            <>
              <span className="mx-1">{'\u2192'}</span>
              <span>{endStr}</span>
            </>
          )}
          {durationStr && (
            <>
              <span className="mx-1.5 opacity-40">·</span>
              <span>{durationStr}</span>
            </>
          )}
          {isActive && (
            <>
              <span className="mx-1.5 opacity-40">·</span>
              <span className="text-accent">active</span>
            </>
          )}
        </span>
      </div>

      {/* Summary content */}
      {hasRichSummary ? (
        <div className="pl-5">
          <div className="text-sm text-text-primary leading-relaxed">{headline}</div>
          {bullets.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {bullets.map((bullet, i) => (
                <li key={i} className="text-xs text-text-secondary leading-relaxed flex items-start gap-1.5">
                  <span className="text-text-tertiary mt-[3px] flex-shrink-0">·</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="pl-5 text-sm text-text-secondary leading-relaxed">
          {isActive ? 'In progress...' : 'No summary available'}
        </div>
      )}
    </div>
  )
}

export function AssistantPanel(): React.ReactNode {
  const journal = useAssistantStore((s) => s.journal)
  const loaded = useAssistantStore((s) => s.loaded)
  const enabled = useAssistantStore((s) => s.enabled)
  const viewingDate = useAssistantStore((s) => s.viewingDate)
  const archivedJournal = useAssistantStore((s) => s.archivedJournal)
  const availableArchiveDates = useAssistantStore((s) => s.availableArchiveDates)
  const navigateDay = useAssistantStore((s) => s.navigateDay)
  const goToToday = useAssistantStore((s) => s.goToToday)
  const loadArchiveDates = useAssistantStore((s) => s.loadArchiveDates)
  const todayTotalMinutes = useWorkTrackerStore((s) => s.todayTotalMinutes)

  useEffect(() => {
    loadArchiveDates()
  }, [loadArchiveDates])

  const isViewingArchive = viewingDate !== null
  const displayJournal = isViewingArchive && archivedJournal ? archivedJournal : journal

  if (!enabled) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-sm text-text-tertiary">Daily Log is disabled</div>
          <div className="text-xs text-text-tertiary mt-1 opacity-60">
            Enable it in Settings to track your work
          </div>
        </div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-text-tertiary">Loading daily log...</span>
      </div>
    )
  }

  const today = new Date()
  const dateLabel = isViewingArchive
    ? formatArchiveDate(viewingDate)
    : today.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })

  const totalSessions = displayJournal.projects.reduce((sum, p) => sum + p.entries.length, 0)
  const hasContent = displayJournal.projects.length > 0

  // Archive navigation
  const todayStr = today.toISOString().slice(0, 10)
  const allDates = [...new Set([...availableArchiveDates, todayStr])].sort()
  const currentDate = viewingDate || todayStr
  const currentIndex = allDates.indexOf(currentDate)
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < allDates.length - 1

  // For archived dates, sum up durations from entries as a rough total
  const archiveTotalMinutes = isViewingArchive
    ? displayJournal.projects.reduce((sum, p) =>
        sum + p.entries.reduce((eSum, e) => {
          if (e.endTime && e.startTime) return eSum + Math.round((e.endTime - e.startTime) / 60000)
          return eSum
        }, 0), 0)
    : todayTotalMinutes

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Date header with navigation */}
      <div className="px-5 pt-5 pb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary mb-1">Daily Log</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDay('prev')}
            disabled={!canGoPrev}
            className="btn-icon btn-icon-sm disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronLeftIcon className="w-4 h-4 text-text-secondary" />
          </button>
          <h2 className="text-lg font-semibold text-text-primary">
            {isViewingArchive ? dateLabel : `Today, ${dateLabel}`}
          </h2>
          <button
            onClick={() => navigateDay('next')}
            disabled={!canGoNext}
            className="btn-icon btn-icon-sm disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronRightIcon className="w-4 h-4 text-text-secondary" />
          </button>
          {isViewingArchive && (
            <button
              onClick={goToToday}
              className="ml-2 text-xs px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {hasContent && (
        <StatsBar
          totalSessions={totalSessions}
          projectCount={displayJournal.projects.length}
          totalMinutes={archiveTotalMinutes}
        />
      )}

      {/* Project groups */}
      {hasContent ? (
        <div className="px-5 pb-5">
          {displayJournal.projects.map((project, idx) => {
            const entryCount = project.entries.length
            return (
              <div key={project.cwd} className="mb-6 last:mb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: PROJECT_COLOR_VARS[idx % PROJECT_COLOR_VARS.length] }}
                  >
                    {project.name}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    ({entryCount} session{entryCount !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="pl-1">
                  {project.entries.map((entry) => (
                    <EntryItem key={entry.sessionId} entry={entry} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <CommandLineIcon className="w-10 h-10 text-text-tertiary/40 mx-auto mb-3" />
            <div className="text-sm text-text-tertiary">
              {isViewingArchive ? 'No sessions recorded' : 'No sessions yet today'}
            </div>
            <div className="text-xs text-text-tertiary mt-1 opacity-60">
              {isViewingArchive
                ? 'Nothing was logged on this day'
                : 'Sessions will appear here as you work'}
            </div>
            {!isViewingArchive && (
              <button
                onClick={() => navigateDay('prev')}
                className="mt-3 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                View yesterday
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
