// src/renderer/src/components/assistant/AssistantPanel.tsx
import React, { useState } from 'react'
import { useAssistantStore } from '../../store/assistant-store'
import { useSessionStore } from '../../store/session-store'

function ActiveBanner(): React.ReactNode {
  const journal = useAssistantStore((s) => s.journal)
  const sessions = useSessionStore((s) => s.sessions)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const activeEntries: Array<{ sessionId: string; name: string; cwd: string }> = []

  for (const project of journal.projects) {
    for (const entry of project.entries) {
      if (entry.status === 'active') {
        activeEntries.push({ sessionId: entry.sessionId, name: entry.sessionName, cwd: project.name })
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
    <div className="mx-3 mb-3 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
        <div className="text-[10px] font-medium text-green-400">Working on</div>
      </div>
      <div className="space-y-1 pl-3.5">
        {activeEntries.map((entry) => (
          <button
            key={entry.sessionId}
            onClick={() => handleClick(entry.sessionId)}
            className="block w-full text-left text-[11px] text-text-primary truncate hover:text-accent transition-colors"
          >
            {entry.name}
            <span className="text-[9px] text-text-tertiary ml-1.5">{entry.cwd}</span>
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
  projectCwd: string
}

/** Strip XML-like tags and clean up display text */
function cleanSummary(text: string): string {
  return text.replace(/<\/?[a-zA-Z][a-zA-Z0-9_-]*>/g, '').trim()
}

function EntryItem({ entry, projectCwd }: EntryItemProps): React.ReactNode {
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

  // Suppress unused variable warning
  void projectCwd

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-start gap-1.5 w-full text-left mb-1.5 hover:bg-surface-100 rounded px-1 py-0.5 -mx-1 transition-colors"
      >
        <span className="text-text-tertiary text-[11px] mt-px flex-shrink-0">•</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">
            {summaryText || displayText}
          </div>
          {timeStr && <div className="text-[9px] text-text-tertiary mt-0.5">{timeStr}</div>}
        </div>
      </button>
    )
  }

  return (
    <div className="bg-surface-100 rounded-md p-2.5 mb-1.5 -mx-1">
      <button
        onClick={() => setExpanded(false)}
        className="text-[11px] text-text-primary font-medium mb-1.5 text-left w-full"
      >
        {summaryText || displayText}
      </button>

      {summaryText && (
        <div className="text-[10px] text-text-tertiary mb-1.5">Session: {displayText}</div>
      )}

      <div className="flex gap-3 text-[9px] text-text-tertiary mb-2">
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
            className="text-[9px] px-2 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            View Session
          </button>
        </div>
      )}
    </div>
  )
}

// Color palette for project headings — cycles through
const PROJECT_COLORS = [
  'text-purple-400',
  'text-cyan-400',
  'text-amber-400',
  'text-green-400',
  'text-pink-400',
  'text-blue-400',
  'text-orange-400',
  'text-red-400'
]

export function AssistantPanel(): React.ReactNode {
  const journal = useAssistantStore((s) => s.journal)
  const loaded = useAssistantStore((s) => s.loaded)
  const enabled = useAssistantStore((s) => s.enabled)

  if (!enabled) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-[11px] text-text-tertiary">AI Journal is disabled</div>
          <div className="text-[10px] text-text-tertiary mt-1 opacity-60">
            Enable it in Settings to track your work
          </div>
        </div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-text-tertiary">Loading journal...</span>
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
      <div className="px-3 pt-3 pb-2">
        <div className="text-[13px] font-semibold text-text-primary">Today — {dateLabel}</div>
        {hasContent && (
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {totalSessions} session{totalSessions !== 1 ? 's' : ''} · {journal.projects.length}{' '}
            project{journal.projects.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Active work banner */}
      <ActiveBanner />

      {/* Project groups */}
      {hasContent ? (
        <div className="px-3 pb-3">
          {journal.projects.map((project, idx) => {
            const completedCount = project.entries.filter((e) => e.status === 'completed').length
            return (
              <div key={project.cwd} className="mb-4 last:mb-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className={`text-[11px] font-semibold ${PROJECT_COLORS[idx % PROJECT_COLORS.length]}`}
                  >
                    {project.name}
                  </span>
                  <span className="text-[9px] text-text-tertiary">
                    — {completedCount} completed
                  </span>
                </div>
                <div className="pl-0.5">
                  {project.entries
                    .filter((e) => e.status === 'completed')
                    .map((entry) => (
                      <EntryItem key={entry.sessionId} entry={entry} projectCwd={project.cwd} />
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="text-[11px] text-text-tertiary">No sessions yet today</div>
            <div className="text-[10px] text-text-tertiary mt-1 opacity-60">
              Accomplishments will appear here as you work
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
