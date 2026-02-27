import { useCallback, useState } from 'react'
import { useSessionStore } from '../../store/session-store'
import { cn } from '../../lib/utils'
import { ConfirmDialog } from '../ui/ConfirmDialog'

interface TerminalHeaderProps {
  sessionId: string
}

export function TerminalHeader({ sessionId }: TerminalHeaderProps) {
  const session = useSessionStore((s) => s.sessions.find((sess) => sess.id === sessionId))
  const removeSession = useSessionStore((s) => s.removeSession)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleKill = useCallback(async () => {
    try {
      await window.electronAPI.killSession(sessionId)
    } catch {
      // session may already be dead
    }
    removeSession(sessionId)
    setShowConfirm(false)
  }, [sessionId, removeSession])

  if (!session) return null

  return (
    <>
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-100 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              session.activityStatus === 'active' && 'bg-status-working',
              session.activityStatus === 'idle' && session.promptWaiting && 'bg-status-waiting',
              session.activityStatus === 'idle' && !session.promptWaiting && 'bg-status-ready',
              session.activityStatus === 'ended' && 'bg-status-inactive'
            )}
            style={session.activityStatus === 'active' ? { animation: 'pulse-dot 1.5s ease-in-out infinite' } : undefined}
          />
          <span className="text-xs font-medium text-text-secondary truncate">{session.name}</span>
        </div>

        <button
          onClick={() => setShowConfirm(true)}
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

      <ConfirmDialog
        isOpen={showConfirm}
        title="Delete session"
        message="Are you sure you want to delete this session? This will terminate the process."
        onConfirm={handleKill}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  )
}
