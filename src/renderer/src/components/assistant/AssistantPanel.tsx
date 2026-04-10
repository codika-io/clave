// src/renderer/src/components/assistant/AssistantPanel.tsx
import { useState } from 'react'
import { useAssistantStore } from '../../store/assistant-store'
import { useSessionStore } from '../../store/session-store'
import { cleanSummary } from '../../lib/journal-utils'

function ActiveBanner(): React.ReactNode {
  const journal = useAssistantStore((s) => s.journal)
  const sessions = useSessionStore((s) => s.sessions)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const activeEntries: Array<{ sessionId: string; name: string; cwd: string }> = []

  for (const project of journal.projects) {
    for (const entry of project.entries) {
      if (entry.status === 'active') {
        activeEntries.push({
          sessionId: entry.sessionId,
          name: entry.sessionName,
          cwd: project.name
        })
      }
    }
  }

  if (activeEntries.length === 0) return null

  const handleClick = (sessionId: string): void => {
    const runtimeSession = sessions.find((s) => s.id === sessionId)
    if (runtimeSession) {
      useSessionStore.getState().selectSession(runtimeSession.id, false)
      setActiveView('terminals')
    }
  }

  return (
    <div
      className="mx-5 mb-4 px-4 py-3 rounded-lg border"
      style={{
        backgroundColor: 'var(--journal-active-bg)',
        borderColor: 'var(--journal-active-border)'
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
          style={{ backgroundColor: 'var(--journal-active-dot)' }}
        />
        <div className="text-xs font-medium" style={{ color: 'var(--journal-active-text)' }}>
          Working on
        </div>
      </div>
      <div className="space-y-1.5 pl-4">
        {activeEntries.map((entry) => (
          <button
            key={entry.sessionId}
            onClick={() => handleClick(entry.sessionId)}
            className="block w-full text-left text-sm text-text-primary truncate hover:text-accent transition-colors"
          >
            {entry.name}
            <span className="text-xs text-text-tertiary ml-2">{entry.cwd}</span>
          </button>
        ))}
      </div>
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

function EntryItem({ entry }: EntryItemProps): React.ReactNode {
  const [expanded, setExpanded] = useState(false)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const sessions = useSessionStore((s) => s.sessions)

  const displayText = entry.sessionName || 'Untitled session'
  const summaryText = entry.summary ? cleanSummary(entry.summary) : undefined
  const timeStr = entry.endTime
    ? new Date(entry.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : entry.status === 'active'
      ? 'in progress'
      : ''

  const runtimeSession = sessions.find((s) => s.id === entry.sessionId)

  const handleViewSession = (): void => {
    if (runtimeSession) {
      useSessionStore.getState().selectSession(runtimeSession.id, false)
      setActiveView('terminals')
    }
  }

  // Calculate duration string
  const durationMs = entry.endTime && entry.startTime ? entry.endTime - entry.startTime : 0
  const durationMin = Math.round(durationMs / 60000)
  const durationStr =
    durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
      : durationMin > 0
        ? `${durationMin}m`
        : ''

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-start gap-2 w-full text-left mb-2 hover:bg-surface-100 rounded-md px-2 py-1 -mx-2 transition-colors"
      >
        <span className="text-text-tertiary text-sm mt-px flex-shrink-0">•</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-text-secondary leading-relaxed line-clamp-2">
            {summaryText || displayText}
          </div>
          {timeStr && <div className="text-xs text-text-tertiary mt-0.5">{timeStr}</div>}
        </div>
      </button>
    )
  }

  return (
    <div className="bg-surface-100 rounded-lg p-3 mb-2 -mx-2">
      <button
        onClick={() => setExpanded(false)}
        className="text-sm text-text-primary font-medium mb-2 text-left w-full"
      >
        {summaryText || displayText}
      </button>

      {summaryText && (
        <div className="text-xs text-text-tertiary mb-2">Session: {displayText}</div>
      )}

      <div className="flex gap-3 text-xs text-text-tertiary mb-2.5">
        {entry.startTime && (
          <span>
            {new Date(entry.startTime).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit'
            })}
            {entry.endTime && (
              <>
                {' → '}
                {new Date(entry.endTime).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </>
            )}
          </span>
        )}
        {durationStr && <span>{durationStr}</span>}
      </div>

      {runtimeSession && (
        <div className="flex gap-1.5">
          <button
            onClick={handleViewSession}
            className="text-xs px-2.5 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            View Session
          </button>
        </div>
      )}
    </div>
  )
}

// CSS variable references for project heading colors — theme-adaptive
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

export function AssistantPanel(): React.ReactNode {
  const journal = useAssistantStore((s) => s.journal)
  const loaded = useAssistantStore((s) => s.loaded)
  const enabled = useAssistantStore((s) => s.enabled)

  if (!enabled) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-sm text-text-tertiary">AI Journal is disabled</div>
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
        <span className="text-sm text-text-tertiary">Loading journal...</span>
      </div>
    )
  }

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })

  const totalSessions = journal.projects.reduce((sum, p) => sum + p.entries.length, 0)
  const hasContent = journal.projects.length > 0

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Date header */}
      <div className="px-5 pt-5 pb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary mb-1">AI Journal</div>
        <h2 className="text-lg font-semibold text-text-primary">Today, {dateLabel}</h2>
        {hasContent && (
          <div className="text-sm text-text-secondary mt-1">
            {totalSessions} session{totalSessions !== 1 ? 's' : ''} across {journal.projects.length}{' '}
            project{journal.projects.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Active work banner */}
      <ActiveBanner />

      {/* Project groups */}
      {hasContent ? (
        <div className="px-5 pb-5">
          {journal.projects.map((project, idx) => {
            const completedCount = project.entries.filter((e) => e.status === 'completed').length
            return (
              <div key={project.cwd} className="mb-6 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: PROJECT_COLOR_VARS[idx % PROJECT_COLOR_VARS.length] }}
                  >
                    {project.name}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    ({completedCount} completed)
                  </span>
                </div>
                <div className="pl-1">
                  {project.entries
                    .filter((e) => e.status === 'completed')
                    .map((entry) => (
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
            <div className="text-sm text-text-tertiary">No sessions yet today</div>
            <div className="text-xs text-text-tertiary mt-1 opacity-60">
              Accomplishments will appear here as you work
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
