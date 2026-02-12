import { useCallback, useState } from 'react'
import { useSessionStore } from '../../store/session-store'
import { SessionItem } from '../session/SessionItem'

export function Sidebar() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const addSession = useSessionStore((s) => s.addSession)
  const searchQuery = useSessionStore((s) => s.searchQuery)
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery)
  const [loading, setLoading] = useState(false)

  const handleNewSession = useCallback(async () => {
    setLoading(true)
    try {
      const folderPath = await window.electronAPI.openFolderDialog()
      if (!folderPath) return

      const sessionInfo = await window.electronAPI.spawnSession(folderPath)
      addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: sessionInfo.folderName,
        alive: sessionInfo.alive
      })
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setLoading(false)
    }
  }, [addSession])

  const filteredSessions = searchQuery
    ? sessions.filter((s) => {
        const q = searchQuery.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          s.folderName.toLowerCase().includes(q) ||
          s.cwd.toLowerCase().includes(q)
        )
      })
    : sessions

  return (
    <div className="flex flex-col h-full bg-surface-50 border-r border-border-subtle">
      {/* Search row with traffic-light offset */}
      <div className="pt-11 px-3 pb-2 flex items-center gap-2">
        <div className="flex-1 relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
          >
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M9.5 9.5L12.5 12.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-surface-100 border-none text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors"
          />
        </div>
        <button
          onClick={handleNewSession}
          disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-100 hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors flex-shrink-0 disabled:opacity-50"
          title="New session"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v12M1 7h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filteredSessions.length === 0 && searchQuery ? (
          <div className="px-3 py-6 text-center text-xs text-text-tertiary">
            No matching sessions
          </div>
        ) : (
          filteredSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={() => setActiveSession(session.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
