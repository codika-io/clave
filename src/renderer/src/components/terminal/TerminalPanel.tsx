import { useCallback } from 'react'
import { useTerminal } from '../../hooks/use-terminal'
import { useSessionStore } from '../../store/session-store'
import { TerminalHeader } from './TerminalHeader'
import { cn } from '../../lib/utils'

interface TerminalPanelProps {
  sessionId: string
}

export function TerminalPanel({ sessionId }: TerminalPanelProps) {
  const { containerRef, focus } = useTerminal(sessionId)
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const setFocusedSession = useSessionStore((s) => s.setFocusedSession)
  const isFocused = focusedSessionId === sessionId

  const handleClick = useCallback(() => {
    if (focusedSessionId !== sessionId) {
      setFocusedSession(sessionId)
    }
    focus()
  }, [sessionId, focusedSessionId, setFocusedSession, focus])

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-surface-50 transition-shadow',
        isFocused ? 'ring-1 ring-accent/30' : ''
      )}
      onMouseDown={handleClick}
    >
      <TerminalHeader sessionId={sessionId} />
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  )
}
