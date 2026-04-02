import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowPathIcon, ClockIcon, PlayIcon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'
import { useHistoryStore } from '../../store/history-store'
import { useSessionStore } from '../../store/session-store'

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return date.toLocaleString()
}

function highlightText(content: string, needle: string): ReactNode {
  if (!needle.trim()) return <>{content}</>

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'ig')
  const parts = content.split(regex)

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="bg-yellow-300/70 text-current rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  )
}

function roleClasses(role: string): string {
  if (role === 'user') return 'bg-surface-100 border-border-subtle'
  if (role === 'assistant') return 'bg-surface-50 border-border'
  if (role === 'tool') return 'bg-surface-200/60 border-border-subtle'
  return 'bg-surface-100/80 border-border-subtle'
}

function ToolMessageContent({
  content,
  renderedContent
}: {
  content: string
  renderedContent: ReactNode
}) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const measure = () => {
      const node = contentRef.current
      if (!node) return
      setIsOverflowing(node.scrollHeight > node.clientHeight + 1)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [content])

  useEffect(() => {
    setExpanded(false)
  }, [content])

  return (
    <div>
      <div
        ref={contentRef}
        className={cn(
          'text-sm leading-6 text-text-primary whitespace-pre-wrap break-words',
          !expanded && 'line-clamp-1'
        )}
      >
        {renderedContent}
      </div>
      {isOverflowing && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-medium text-text-tertiary hover:text-text-primary transition-colors"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      )}
    </div>
  )
}

export function HistoryPanel() {
  const selectedSession = useHistoryStore((s) => s.selectedSession)
  const messages = useHistoryStore((s) => s.messages)
  const isLoadingMessages = useHistoryStore((s) => s.isLoadingMessages)
  const targetMessageId = useHistoryStore((s) => s.targetMessageId)
  const clearTargetMessage = useHistoryStore((s) => s.clearTargetMessage)
  const refresh = useHistoryStore((s) => s.refresh)
  const searchQuery = useHistoryStore((s) => s.searchQuery)
  const addSession = useSessionStore((s) => s.addSession)
  const selectTerminalSession = useSessionStore((s) => s.selectSession)
  const setFocusedSession = useSessionStore((s) => s.setFocusedSession)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const setSidebarSearchQuery = useSessionStore((s) => s.setSearchQuery)

  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!targetMessageId) return
    const target = messageRefs.current[targetMessageId]
    if (!target) return

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = window.setTimeout(() => {
      clearTargetMessage()
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [targetMessageId, clearTargetMessage, messages])

  const restoreSession = async () => {
    if (!selectedSession) return
    try {
      const sessionInfo = await window.electronAPI.spawnSession(selectedSession.cwd, {
        claudeMode: true,
        resumeSessionId: selectedSession.sessionId
      })
      addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: selectedSession.title || sessionInfo.folderName,
        alive: sessionInfo.alive,
        activityStatus: 'idle',
        promptWaiting: null,
        claudeMode: true,
        dangerousMode: false,
        claudeSessionId: sessionInfo.claudeSessionId,
        sessionType: 'local'
      })
      setSidebarSearchQuery('')
      setFocusedSession(sessionInfo.id)
      selectTerminalSession(sessionInfo.id, false)
      setActiveView('terminals')
    } catch (error) {
      console.error('Failed to restore Claude session:', error)
    }
  }

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [messages]
  )

  if (!selectedSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-tertiary">
        Select a Claude history session to view its conversation.
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-surface-50">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 border-b border-border bg-surface-100/80">
        <div className="min-w-0 flex-1 basis-0">
          <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary mb-1">
            Claude History
          </div>
          <h2 className="text-lg font-semibold text-text-primary truncate">
            {selectedSession.title}
          </h2>
          <div className="text-sm text-text-secondary truncate mt-1">
            {selectedSession.cwd}
          </div>
          {selectedSession.summary && (
            <p className="text-sm text-text-tertiary mt-2 line-clamp-2">
              {selectedSession.summary}
            </p>
          )}
        </div>

        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => refresh()}
            className="h-9 px-3 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors inline-flex items-center gap-2"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={restoreSession}
            className="h-9 px-3 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            <PlayIcon className="w-4 h-4" />
            Resume
          </button>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-border bg-surface-50/80 text-xs text-text-tertiary flex items-center gap-5">
        <span>{selectedSession.messageCount} messages</span>
        <span className="inline-flex items-center gap-1.5">
          <ClockIcon className="w-3.5 h-3.5" />
          Last updated {formatTimestamp(selectedSession.lastModified)}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">
        {isLoadingMessages ? (
          <div className="text-sm text-text-tertiary">Loading session messages...</div>
        ) : sortedMessages.length === 0 ? (
          <div className="text-sm text-text-tertiary">No visible messages in this session.</div>
        ) : (
          sortedMessages.map((message) => (
            <div
              key={message.id}
              ref={(node) => {
                messageRefs.current[message.id] = node
              }}
              className={cn(
                'rounded-xl border p-4 transition-colors',
                roleClasses(message.role),
                targetMessageId === message.id && 'ring-2 ring-accent shadow-[0_0_0_1px_rgba(0,0,0,0.04)]'
              )}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {message.role}
                </span>
                <span className="text-xs text-text-tertiary">
                  {formatTimestamp(message.timestamp)}
                </span>
              </div>
              {message.role === 'tool' ? (
                <ToolMessageContent
                  content={message.content}
                  renderedContent={highlightText(message.content, searchQuery)}
                />
              ) : (
                <div className="text-sm leading-6 text-text-primary whitespace-pre-wrap break-words">
                  {highlightText(message.content, searchQuery)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
