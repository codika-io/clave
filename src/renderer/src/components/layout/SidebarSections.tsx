import { useCallback, useMemo, useState } from 'react'
import {
  ChevronRightIcon,
  ClockIcon,
  QueueListIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import { useSessionStore } from '../../store/session-store'
import { useBoardStore } from '../../store/board-store'
import { useHistoryStore, type HistorySession } from '../../store/history-store'
import { cn } from '../../lib/utils'
import { filterMetaSessions } from '../../lib/history-utils'

export function SectionHeading({
  title,
  collapsed,
  onToggle,
  actions
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  actions?: React.ReactNode
}) {
  return (
    <div className="w-full flex items-center gap-1.5 px-3 pt-3.5 pb-1 flex-shrink-0">
      <button onClick={onToggle} className="flex items-center gap-1.5">
        <ChevronRightIcon
          className={cn(
            'w-3 h-3 text-text-tertiary transition-transform duration-150',
            collapsed ? 'rotate-0' : 'rotate-90'
          )}
        />
        <span className="text-[13px] font-medium text-text-tertiary">{title}</span>
      </button>
      {actions && <div className="ml-auto flex items-center gap-0.5">{actions}</div>}
    </div>
  )
}

export function TaskQueueSection({ collapsed }: { collapsed: boolean }) {
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const tasks = useBoardStore((s) => s.tasks)
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="grid transition-[grid-template-rows,opacity,transform] duration-250 ease-out flex-shrink-0"
      style={{
        gridTemplateRows: collapsed ? '0fr' : '1fr',
        opacity: collapsed ? 0 : 1,
        transform: collapsed ? 'translateY(-4px)' : 'translateY(0)'
      }}
    >
      <div className="overflow-hidden">
        <div className="px-2 pb-1">
          {/* Queue row — clickable to navigate, chevron to expand sub-items */}
          <button
            onClick={() => setActiveView('board')}
            data-selected={activeView === 'board' ? 'true' : undefined}
            className="sidebar-item"
          >
            <QueueListIcon className="sidebar-tab-icon flex-shrink-0 text-text-tertiary" />
            <span className="truncate">Queue</span>
            {tasks.length > 0 && (
              <span className="ml-auto flex items-center gap-1.5">
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpanded((v) => !v)
                  }}
                  className="btn-icon btn-icon-xs hover:bg-surface-300/50"
                >
                  <ChevronRightIcon
                    className={cn(
                      'w-3 h-3 text-text-tertiary transition-transform duration-150',
                      expanded ? 'rotate-90' : 'rotate-0'
                    )}
                  />
                </span>
              </span>
            )}
          </button>

          {/* Expanded sub-items: task list with vertical connecting line */}
          {expanded && tasks.length > 0 && (
            <div className="relative ml-[18px] mt-0.5">
              {/* Vertical connecting line */}
              <div className="absolute left-0 top-0 bottom-0 w-px bg-border-subtle" />

              {tasks.map((task) => {
                const label = task.title || task.prompt
                return (
                  <button
                    key={task.id}
                    onClick={() => setActiveView('board')}
                    className="group relative w-full flex items-center gap-2 pl-4 pr-2 py-1 text-left rounded-r-md hover:bg-surface-100 transition-colors"
                  >
                    {/* Horizontal branch tick */}
                    <div className="absolute left-0 top-1/2 w-2.5 h-px bg-border-subtle" />
                    <span className="text-[12px] text-text-secondary truncate">{label}</span>
                    {task.dangerousMode && (
                      <span className="flex-shrink-0 text-[9px] text-red-400 font-medium">
                        skip
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function HistorySection({ collapsed }: { collapsed: boolean }) {
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const sessionsByProject = useHistoryStore((s) => s.sessionsByProject)
  const isLoadingProjects = useHistoryStore((s) => s.isLoadingProjects)
  const selectedSessionId = useHistoryStore((s) => s.selectedSessionId)
  const projects = useHistoryStore((s) => s.projects)
  const refresh = useHistoryStore((s) => s.refresh)
  const selectSession = useHistoryStore((s) => s.selectSession)
  const clearSelectedSession = useHistoryStore((s) => s.clearSelectedSession)

  const [expanded, setExpanded] = useState(false)
  const [loadStarted, setLoadStarted] = useState(false)

  const ensureLoaded = useCallback(() => {
    if (loadStarted || isLoadingProjects || projects.length > 0) return
    setLoadStarted(true)
    refresh().catch(console.error)
  }, [loadStarted, isLoadingProjects, projects.length, refresh])

  const recentSessions = useMemo(() => {
    const all = Object.values(sessionsByProject)
      .flat()
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
    return filterMetaSessions(all).slice(0, 10)
  }, [sessionsByProject])

  const totalCount = useMemo(() => {
    const all = Object.values(sessionsByProject).flat()
    return filterMetaSessions(all).length
  }, [sessionsByProject])

  const openSession = (session: HistorySession) => {
    setActiveView('history')
    selectSession(session).catch(console.error)
  }

  const openAll = () => {
    ensureLoaded()
    clearSelectedSession()
    setActiveView('history')
  }

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!expanded) ensureLoaded()
    setExpanded((v) => !v)
  }

  return (
    <div
      className="grid transition-[grid-template-rows,opacity,transform] duration-250 ease-out flex-shrink-0"
      style={{
        gridTemplateRows: collapsed ? '0fr' : '1fr',
        opacity: collapsed ? 0 : 1,
        transform: collapsed ? 'translateY(-4px)' : 'translateY(0)'
      }}
    >
      <div className="overflow-hidden">
        <div className="px-2 pb-1">
          {/* History row — mirrors Queue design */}
          <button
            onClick={openAll}
            data-selected={activeView === 'history' ? 'true' : undefined}
            className="sidebar-item"
          >
            <ClockIcon className="sidebar-tab-icon flex-shrink-0 text-text-tertiary" />
            <span className="truncate">History</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span
                role="button"
                onClick={handleChevronClick}
                className="btn-icon btn-icon-xs hover:bg-surface-300/50"
              >
                <ChevronRightIcon
                  className={cn(
                    'w-3 h-3 text-text-tertiary transition-transform duration-150',
                    expanded ? 'rotate-90' : 'rotate-0'
                  )}
                />
              </span>
            </span>
          </button>

          {/* Expanded: flat list of 10 most recent sessions with vertical connecting line */}
          {expanded && (
            <div className="relative ml-[18px] mt-0.5">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-border-subtle" />

              {isLoadingProjects && recentSessions.length === 0 ? (
                <div className="pl-4 py-1.5 text-[12px] text-text-tertiary">Loading…</div>
              ) : recentSessions.length === 0 ? (
                <div className="pl-4 py-1.5 text-[12px] text-text-tertiary">No history found.</div>
              ) : (
                <>
                  {recentSessions.map((session) => {
                    const displayTitle = session.summary || session.title
                    return (
                      <button
                        key={session.id}
                        onClick={() => openSession(session)}
                        className={cn(
                          'group relative w-full flex items-center gap-2 pl-4 pr-2 py-1 text-left rounded-r-md transition-colors',
                          activeView === 'history' && selectedSessionId === session.sourcePath
                            ? 'bg-surface-200 text-text-primary'
                            : 'hover:bg-surface-100 text-text-secondary'
                        )}
                      >
                        <div className="absolute left-0 top-1/2 w-2.5 h-px bg-border-subtle" />
                        <SparklesIcon className="flex-shrink-0 w-3 h-3 text-text-tertiary" />
                        <span className="text-[12px] truncate">{displayTitle}</span>
                      </button>
                    )
                  })}

                  {totalCount > 10 && (
                    <button
                      onClick={openAll}
                      className="group relative w-full flex items-center pl-4 pr-2 py-1.5 text-left rounded-r-md hover:bg-surface-100 transition-colors"
                    >
                      <div className="absolute left-0 top-1/2 w-2.5 h-px bg-border-subtle" />
                      <span className="text-[12px] text-accent">View all history →</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

