import { useSessionStore } from '../../store/session-store'
import { SessionItem } from '../session/SessionItem'
import { NewSessionButton } from '../session/NewSessionButton'

export function Sidebar() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  return (
    <div className="flex flex-col h-full bg-surface-50 border-r border-border-subtle">
      {/* Offset for traffic lights */}
      <div className="pt-11 px-4 pb-2">
        <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
          Sessions
        </h2>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onClick={() => setActiveSession(session.id)}
          />
        ))}
      </div>

      {/* New session button */}
      <div className="p-3 border-t border-border-subtle">
        <NewSessionButton />
      </div>
    </div>
  )
}
