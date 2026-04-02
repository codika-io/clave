import { useEffect, useMemo, useState } from 'react'
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  ChatBubbleLeftRightIcon,
  UserIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'
import { useHistoryStore } from '../../store/history-store'
import type { HistorySession } from '../../store/history-store'
import { useSessionStore } from '../../store/session-store'
import { SectionHeading } from '../layout/SidebarSections'
import { Collapsible, CollapsibleContent } from '../ui/collapsible'

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}

function highlightText(content: string, needle: string) {
  if (!needle.trim()) return content

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'ig')
  const parts = content.split(regex)

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark
            key={`${part}-${index}`}
            className="bg-yellow-300/70 text-current rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  )
}

function roleBadgeClasses(role: string): string {
  if (role === 'user') {
    return 'bg-sky-100 text-sky-700 ring-1 ring-sky-200'
  }
  if (role === 'assistant') {
    return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
  }
  return 'bg-surface-200 text-text-secondary ring-1 ring-border-subtle'
}

export function HistorySidebarSection() {
  const projects = useHistoryStore((s) => s.projects)
  const sessionsByProject = useHistoryStore((s) => s.sessionsByProject)
  const selectedSessionId = useHistoryStore((s) => s.selectedSessionId)
  const isLoadingProjects = useHistoryStore((s) => s.isLoadingProjects)
  const isSearching = useHistoryStore((s) => s.isSearching)
  const searchRoleFilter = useHistoryStore((s) => s.searchRoleFilter)
  const searchResults = useHistoryStore((s) => s.searchResults)
  const refresh = useHistoryStore((s) => s.refresh)
  const selectSession = useHistoryStore((s) => s.selectSession)
  const setSearchRoleFilter = useHistoryStore((s) => s.setSearchRoleFilter)
  const searchMessages = useHistoryStore((s) => s.searchMessages)
  const clearSearch = useHistoryStore((s) => s.clearSearch)
  const openSearchResult = useHistoryStore((s) => s.openSearchResult)
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const globalSearchQuery = useSessionStore((s) => s.searchQuery)

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [expandedSearchGroups, setExpandedSearchGroups] = useState<Record<string, boolean>>({})
  const [sectionCollapsed, setSectionCollapsed] = useState(false)
  const [initialLoadStarted, setInitialLoadStarted] = useState(false)
  const [initialLoadPending, setInitialLoadPending] = useState(true)

  useEffect(() => {
    if (projects.length > 0) {
      setInitialLoadPending(false)
      return
    }

    if (initialLoadStarted || isLoadingProjects) {
      return
    }

    setInitialLoadStarted(true)
    setInitialLoadPending(true)
    refresh()
      .catch((error) => {
        console.error('Failed to refresh Claude history:', error)
      })
      .finally(() => {
        setInitialLoadPending(false)
      })
  }, [initialLoadStarted, isLoadingProjects, projects.length, refresh])

  useEffect(() => {
    if (projects.length === 0) return
    setExpandedProjects((current) => {
      const next = { ...current }
      let changed = false
      for (const project of projects) {
        if (typeof next[project.id] !== 'boolean') {
          next[project.id] = false
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [projects])

  useEffect(() => {
    if (!globalSearchQuery.trim()) {
      clearSearch()
      return
    }

    searchMessages(globalSearchQuery, searchRoleFilter).catch((error) => {
      console.error('Failed to search Claude history:', error)
    })
  }, [clearSearch, globalSearchQuery, searchMessages, searchRoleFilter])

  useEffect(() => {
    if (globalSearchQuery.trim()) {
      setSectionCollapsed(false)
    }
  }, [globalSearchQuery])

  const groupedSearchResults = useMemo(() => {
    const groups = new Map<string, typeof searchResults>()
    for (const result of searchResults) {
      const key = `${result.projectId}:${result.sourcePath}`
      const existing = groups.get(key) ?? []
      existing.push(result)
      groups.set(key, existing)
    }
    return Array.from(groups.entries())
  }, [searchResults])

  useEffect(() => {
    if (groupedSearchResults.length === 0) return
    setExpandedSearchGroups((current) => {
      const next = { ...current }
      let changed = false
      for (const [groupKey] of groupedSearchResults) {
        if (typeof next[groupKey] !== 'boolean') {
          next[groupKey] = true
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [groupedSearchResults])

  const openHistorySession = (session: HistorySession) => {
    setActiveView('history')
    selectSession(session).catch((error) => {
      console.error('Failed to select Claude history session:', error)
    })
  }

  const handleProjectClick = (projectId: string, sessions: HistorySession[]) => {
    const nextExpanded = !(expandedProjects[projectId] ?? false)
    setExpandedProjects((current) => ({
      ...current,
      [projectId]: nextExpanded
    }))

    if (nextExpanded && sessions.length === 1) {
      openHistorySession(sessions[0])
    }
  }

  const toggleSearchGroup = (groupKey: string) => {
    setExpandedSearchGroups((current) => ({
      ...current,
      [groupKey]: !(current[groupKey] ?? true)
    }))
  }

  const handleRoleFilterChange = (role: typeof searchRoleFilter) => {
    setSearchRoleFilter(role)
  }

  const isSearchMode = globalSearchQuery.trim().length > 0
  const showInitialHistoryLoading = (initialLoadPending || isLoadingProjects) && projects.length === 0

  return (
    <div className="pb-3">
      <SectionHeading
        title={isSearchMode ? 'Conversations' : 'Claude History'}
        collapsed={sectionCollapsed}
        onToggle={() => setSectionCollapsed((value) => !value)}
        actions={
          <button
            type="button"
            onClick={async (event) => {
              event.stopPropagation()
              await refresh()
              if (globalSearchQuery.trim()) {
                await searchMessages(globalSearchQuery, searchRoleFilter)
              }
            }}
            className="w-5 h-5 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-200 transition-colors"
            title="Refresh Claude history"
          >
            <ArrowPathIcon className={cn('w-3.5 h-3.5', isLoadingProjects && 'animate-spin')} />
          </button>
        }
      />

      <Collapsible open={!sectionCollapsed} className="flex-shrink-0">
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          <div className="px-2 space-y-1">
            {isSearchMode && (
              <div className="px-2.5 mb-2">
                <div className="mb-2 text-[11px] text-text-tertiary">
                  Searching Claude history for "{globalSearchQuery}"
                </div>
                <div className="flex items-center gap-1">
                  {([
                    { id: 'all', label: 'All', icon: null },
                    { id: 'user', label: 'User', icon: <UserIcon className="w-3 h-3" /> },
                    { id: 'assistant', label: 'Assistant', icon: <SparklesIcon className="w-3 h-3" /> }
                  ] as const).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleRoleFilterChange(option.id)}
                      className={cn(
                        'h-6 px-2 rounded-md text-[11px] inline-flex items-center gap-1 transition-colors',
                        searchRoleFilter === option.id
                          ? 'bg-surface-200 text-text-primary'
                          : 'text-text-tertiary hover:text-text-primary hover:bg-surface-100'
                      )}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showInitialHistoryLoading ? (
              <div className="px-2.5 py-2">
                <div className="rounded-xl border border-border-subtle bg-surface-50 overflow-hidden">
                  <div className="px-3 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary">
                          Loading Claude Code History
                        </div>
                        <div className="mt-1 text-xs leading-5 text-text-tertiary">
                          Scanning local working directories and sessions. This usually takes a few seconds.
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {[0, 1, 2].map((index) => (
                        <div
                          key={`history-loading-row-${index}`}
                          className="rounded-lg border border-border-subtle bg-surface-100/80 px-3 py-2.5 animate-pulse"
                        >
                          <div className="h-3 w-24 rounded bg-surface-200" />
                          <div className="mt-2 h-2.5 w-full rounded bg-surface-200" />
                          <div className="mt-1.5 h-2.5 w-2/3 rounded bg-surface-200" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : isSearchMode ? (
              isSearching ? (
                <div className="px-2.5 py-2 text-xs text-text-tertiary">Searching messages...</div>
              ) : groupedSearchResults.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-text-tertiary">No matching conversation text.</div>
              ) : (
                groupedSearchResults.map(([groupKey, results]) => {
                  const expanded = expandedSearchGroups[groupKey] ?? true

                  return (
                    <div key={groupKey} className="rounded-xl border border-border-subtle bg-surface-50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleSearchGroup(groupKey)}
                        className="w-full px-2.5 py-2 text-[11px] text-left text-text-tertiary hover:bg-surface-100 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          {expanded ? (
                            <ChevronDownIcon className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
                          ) : (
                            <ChevronRightIcon className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-text-secondary truncate">{results[0]?.projectName}</div>
                            <div className="truncate">
                              {highlightText(results[0]?.sessionTitle ?? '', globalSearchQuery)}
                            </div>
                          </div>
                        </div>
                      </button>
                      {expanded && (
                        <div className="py-1 border-t border-border-subtle">
                          {results.slice(0, 6).map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              onClick={() => {
                                openSearchResult(result).catch((error) => {
                                  console.error('Failed to open Claude history search result:', error)
                                })
                              }}
                              className={cn(
                                'w-full px-2.5 py-2 text-left hover:bg-surface-100 transition-colors',
                                result.role === 'user' && 'bg-sky-50/60',
                                result.role === 'assistant' && 'bg-amber-50/60',
                                activeView === 'history' && selectedSessionId === result.sourcePath && 'bg-surface-100'
                              )}
                            >
                              <div className="flex items-center gap-2 text-[11px] text-text-tertiary mb-1">
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                                    roleBadgeClasses(result.role)
                                  )}
                                >
                                  {result.role === 'user' ? (
                                    <UserIcon className="w-3 h-3" />
                                  ) : result.role === 'assistant' ? (
                                    <SparklesIcon className="w-3 h-3" />
                                  ) : (
                                    <ChatBubbleLeftRightIcon className="w-3 h-3" />
                                  )}
                                  {result.role}
                                </span>
                                <span>{formatRelativeTime(result.timestamp)}</span>
                              </div>
                              <div className="text-xs text-text-primary leading-5 break-words">
                                {highlightText(result.preview, globalSearchQuery)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )
            ) : projects.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-text-tertiary">
                No Claude history was found on this Mac.
              </div>
            ) : (
              projects.map((project) => {
                const sessions = sessionsByProject[project.id] ?? []
                const expanded = expandedProjects[project.id] ?? false
                const previewTitles = sessions.slice(0, 2).map((session) => session.title)

                return (
                  <div key={project.id} className="rounded-xl border border-border-subtle bg-surface-50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleProjectClick(project.id, sessions)}
                      className="w-full px-2.5 py-2.5 flex items-start gap-2 text-left hover:bg-surface-100 transition-colors"
                    >
                      {expanded ? (
                        <ChevronDownIcon className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
                      )}
                      <FolderIcon className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-text-primary truncate">
                          {project.name}
                        </div>
                        {!expanded && (
                          <div className="mt-1 space-y-1 text-[11px] text-text-tertiary">
                            {previewTitles.map((title, index) => (
                              <div key={`${project.id}-preview-${index}`} className="truncate">
                                {title}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-border-subtle px-1.5 py-1">
                        {sessions.map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => openHistorySession(session)}
                            className={cn(
                              'w-full rounded-lg px-2 py-2 text-left transition-colors',
                              activeView === 'history' && selectedSessionId === session.sourcePath
                                ? 'bg-surface-200 text-text-primary'
                                : 'hover:bg-surface-100 text-text-secondary'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <SparklesIcon className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
                              <div className="text-xs font-medium truncate">{session.title}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
