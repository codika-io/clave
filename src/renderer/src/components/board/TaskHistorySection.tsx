import { useState, useEffect, useMemo } from 'react'
import { ClockIcon, ChatBubbleLeftRightIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { useHistoryStore, type HistorySession } from '../../store/history-store'

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDuration(startStr: string, endStr: string): string {
  const start = new Date(startStr).getTime()
  const end = new Date(endStr).getTime()
  const diffMin = Math.floor((end - start) / 60000)
  if (diffMin < 1) return '<1m'
  if (diffMin < 60) return `${diffMin}m`
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

interface TaskHistorySectionProps {
  claudeSessionId: string
  onBrowseHistory: (session: HistorySession) => void
}

export function TaskHistorySection({ claudeSessionId, onBrowseHistory }: TaskHistorySectionProps) {
  const sessionsByProject = useHistoryStore((s) => s.sessionsByProject)
  const refresh = useHistoryStore((s) => s.refresh)
  const [loading, setLoading] = useState(false)
  const [refreshed, setRefreshed] = useState(false)

  const historySession = useMemo(() => {
    for (const sessions of Object.values(sessionsByProject)) {
      const match = sessions.find((s) => s.sessionId === claudeSessionId)
      if (match) return match
    }
    return null
  }, [sessionsByProject, claudeSessionId])

  useEffect(() => {
    if (!historySession && !refreshed && !loading) {
      setLoading(true)
      setRefreshed(true)
      refresh().finally(() => setLoading(false))
    }
  }, [historySession, refreshed, loading, refresh])

  if (loading) {
    return (
      <div className="text-xs text-text-tertiary py-2">
        Loading history...
      </div>
    )
  }

  if (!historySession) {
    return (
      <div className="text-xs text-text-tertiary py-2">
        Session history not found
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {historySession.summary && (
        <p className="text-xs text-text-secondary line-clamp-3">
          {historySession.summary}
        </p>
      )}

      <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1">
          <ChatBubbleLeftRightIcon className="w-3 h-3" />
          {historySession.messageCount} messages
        </span>
        <span className="flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          {formatDuration(historySession.createdAt, historySession.lastModified)}
        </span>
        <span>{formatRelativeDate(historySession.lastModified)}</span>
      </div>

      <button
        onClick={() => onBrowseHistory(historySession)}
        className="h-6 px-2.5 rounded text-[11px] font-medium bg-accent/10 hover:bg-accent/20 text-accent transition-colors flex items-center gap-1"
      >
        <ArrowTopRightOnSquareIcon className="w-3 h-3" />
        Browse History
      </button>
    </div>
  )
}
