import { useMemo } from 'react'
import { useSessionStore, getDisplayOrder } from '../../store/session-store'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { TerminalErrorBoundary } from '../terminal/TerminalErrorBoundary'
import { EmptyState } from '../ui/EmptyState'

function computeGridLayout(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 }
  if (count === 2) return { cols: 2, rows: 1 }
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  return { cols, rows }
}

export function TerminalGrid() {
  const selectedSessionIds = useSessionStore((s) => s.selectedSessionIds)
  const sessions = useSessionStore((s) => s.sessions)
  const groups = useSessionStore((s) => s.groups)
  const displayOrder = useSessionStore((s) => s.displayOrder)

  const orderedSessions = useMemo(() => {
    const order = getDisplayOrder({ sessions, groups, displayOrder })
    const sessionMap = new Map(sessions.map((s) => [s.id, s]))
    const placed = new Set<string>()
    const result: typeof sessions = []
    for (const id of order) {
      const group = groups.find((g) => g.id === id)
      if (group) {
        for (const sid of group.sessionIds) {
          const session = sessionMap.get(sid)
          if (session) { result.push(session); placed.add(sid) }
        }
      } else {
        const session = sessionMap.get(id)
        if (session) { result.push(session); placed.add(id) }
      }
    }
    // Include hidden terminal sessions (not in displayOrder or group.sessionIds)
    for (const s of sessions) {
      if (!placed.has(s.id)) result.push(s)
    }
    return result
  }, [sessions, groups, displayOrder])

  if (sessions.length === 0) {
    return <EmptyState />
  }

  const hasSelection = selectedSessionIds.length > 0
  const { cols, rows } = computeGridLayout(selectedSessionIds.length)

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* "Select a session" overlay when nothing is selected */}
      {!hasSelection && (
        <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10">
          Select a session
        </div>
      )}

      {/* Grid always renders ALL terminals to keep them alive.
          Non-selected ones are hidden via display:none so they
          don't participate in the grid layout but stay mounted
          (xterm instance + PTY listener preserved). */}
      <div
        className="h-full grid gap-px bg-border-subtle"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`
        }}
      >
        {orderedSessions.map((session) => {
          const isSelected = selectedSessionIds.includes(session.id)
          return (
            <div
              key={session.id}
              className="min-h-0 min-w-0 h-full"
              style={{ display: isSelected ? undefined : 'none' }}
            >
              <TerminalErrorBoundary sessionId={session.id}>
                <TerminalPanel sessionId={session.id} />
              </TerminalErrorBoundary>
            </div>
          )
        })}
      </div>
    </div>
  )
}
