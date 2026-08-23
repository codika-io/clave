import { useMemo } from 'react'
import {
  useSessionStore,
  getDisplayOrder,
  isFileTabId,
  inActiveWorkspace
} from '../../store/session-store'
import { useWorkspaceStore } from '../../store/workspace-store'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { RemoteTerminalPanel } from '../terminal/RemoteTerminalPanel'
import { TerminalErrorBoundary } from '../terminal/TerminalErrorBoundary'
import { FileViewer } from '../files/FileViewer'
import { DiffViewer } from '../files/DiffViewer'
import { EmptyState } from '../ui/EmptyState'
import { GroupViewPanel } from './GroupViewPanel'
import { SessionViewPanel } from './SessionViewPanel'

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
  const fileTabs = useSessionStore((s) => s.fileTabs)
  const groups = useSessionStore((s) => s.groups)
  const displayOrder = useSessionStore((s) => s.displayOrder)
  const activeGroupViewId = useSessionStore((s) => s.activeGroupViewId)
  const activeSessionViewId = useSessionStore((s) => s.activeSessionViewId)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  // Re-validate the active group view — the id may be stale (group deleted,
  // view detached, workspace switched); a stale id silently falls back to the grid.
  const viewGroup =
    (activeGroupViewId &&
      groups.find(
        (g) =>
          g.id === activeGroupViewId && g.view && inActiveWorkspace(g, activeWorkspaceId)
      )) ||
    null

  // Same re-validation for a session's view — the id may be stale (session
  // closed, view detached, workspace switched); stale falls back to the grid.
  const viewSession =
    (activeSessionViewId &&
      sessions.find(
        (s) =>
          s.id === activeSessionViewId && s.view && inActiveWorkspace(s, activeWorkspaceId)
      )) ||
    null

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

  // Separate selected items into sessions, file tabs, and agent sessions
  const agentSessionIds = new Set(sessions.filter((s) => s.sessionType === 'agent').map((s) => s.id))
  const selectedFileTabIds = selectedSessionIds.filter((id) => isFileTabId(id))
  const selectedTerminalIds = selectedSessionIds.filter((id) => !isFileTabId(id) && !agentSessionIds.has(id))

  if (sessions.length === 0 && fileTabs.length === 0) {
    return <EmptyState />
  }

  // Don't count agent sessions in the grid layout
  const hasSelection = selectedSessionIds.length > 0
  const visibleCount = selectedTerminalIds.length + selectedFileTabIds.length
  const { cols, rows } = computeGridLayout(visibleCount)

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* "Select a session" overlay when nothing is selected */}
      {!hasSelection && !viewGroup && !viewSession && (
        <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10">
          Select a session
        </div>
      )}

      {/* A group's attached web view replaces the mosaic; the grid below stays
          mounted (hidden) so every terminal keeps running. */}
      {viewGroup && (
        <div className="absolute inset-0">
          <GroupViewPanel group={viewGroup} />
        </div>
      )}

      {/* A session's attached web view replaces its terminal the same way;
          the grid below stays mounted (hidden) so the terminal keeps running.
          The two are mutually exclusive: setting either active id clears the
          other (see session-store). */}
      {!viewGroup && viewSession && (
        <div className="absolute inset-0">
          <SessionViewPanel session={viewSession} />
        </div>
      )}

      {/* Grid renders ALL terminals to keep them alive + selected file tabs */}
      <div
        className="h-full grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          ...(viewGroup ? { visibility: 'hidden' as const } : {})
        }}
      >
        {orderedSessions.map((session) => {
          // Agent sessions use AgentChatPanel via activeView, skip entirely
          if (session.sessionType === 'agent') return null
          const isSelected = selectedTerminalIds.includes(session.id)
          return (
            <div
              key={session.id}
              className="min-h-0 min-w-0 h-full floating-card"
              style={{ display: isSelected ? undefined : 'none' }}
            >
              <TerminalErrorBoundary sessionId={session.id}>
                {(session.sessionType === 'remote-terminal' || session.sessionType === 'remote-claude') &&
                 session.locationId && session.shellId ? (
                  <RemoteTerminalPanel
                    sessionId={session.id}
                    shellId={session.shellId}
                    locationId={session.locationId}
                  />
                ) : session.locationId && session.locationId !== 'local' && session.shellId ? (
                  <RemoteTerminalPanel
                    sessionId={session.id}
                    shellId={session.shellId}
                    locationId={session.locationId}
                  />
                ) : (
                  <TerminalPanel sessionId={session.id} />
                )}
              </TerminalErrorBoundary>
            </div>
          )
        })}
        {selectedFileTabIds.map((ftId) => {
          const fileTab = fileTabs.find((f) => f.id === ftId)
          if (!fileTab) return null
          return (
            <div key={fileTab.id} className="min-h-0 min-w-0 h-full floating-card">
              {fileTab.kind === 'diff' ? (
                <DiffViewer fileTab={fileTab} />
              ) : (
                <FileViewer fileTab={fileTab} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
