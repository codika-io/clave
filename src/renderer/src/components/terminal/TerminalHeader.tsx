import { useCallback } from 'react'
import { useSessionStore } from '../../store/session-store'
import { cn } from '../../lib/utils'

interface TerminalHeaderProps {
  sessionId: string
}

export function TerminalHeader({ sessionId }: TerminalHeaderProps) {
  const session = useSessionStore((s) => s.sessions.find((sess) => sess.id === sessionId))
  const removeSession = useSessionStore((s) => s.removeSession)

  const handleKill = useCallback(async () => {
    await window.electronAPI.killSession(sessionId)
    removeSession(sessionId)
  }, [sessionId, removeSession])

  if (!session) return null

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-surface-100 border-b border-border-subtle flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            session.alive ? 'bg-status-active' : 'bg-status-inactive'
          )}
        />
        <span className="text-xs font-medium text-text-secondary truncate">{session.name}</span>
      </div>

      <button
        onClick={handleKill}
        className="p-1 rounded hover:bg-surface-300 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
        title="Kill session"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 2.5l7 7M9.5 2.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
