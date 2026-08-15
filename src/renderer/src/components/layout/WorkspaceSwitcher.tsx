import { useMemo } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useWorkspaceStore } from '../../store/workspace-store'
import { useSessionStore } from '../../store/session-store'
import { setActiveWorkspace } from '../../lib/workspace-actions'

/** Sidebar-top workspace switcher: one pill per workspace, click to switch the
 *  whole visible world (sessions, groups, templates, toolbar). Hidden in
 *  no-workspace mode — with zero workspaces the app is unscoped and the
 *  concept shouldn't be visible at all. */
export function WorkspaceSwitcher(): React.JSX.Element | null {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const sessions = useSessionStore((s) => s.sessions)
  const openSettings = useSessionStore((s) => s.openSettings)

  // Activity dots: a hidden workspace with a session waiting on the user
  // (unseen activity or a pending permission prompt) shows a small marker so
  // switching away never means missing an agent that needs attention.
  const attention = useMemo(() => {
    const ids = new Set<string>()
    for (const session of sessions) {
      if (!session.hasUnseenActivity && !session.promptWaiting) continue
      if (session.workspaceId && session.workspaceId !== activeWorkspaceId) {
        ids.add(session.workspaceId)
      }
    }
    return ids
  }, [sessions, activeWorkspaceId])

  if (workspaces.length === 0) return null

  return (
    <div className="px-2 pb-1 flex-shrink-0">
      <div className="segmented w-full">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            className="segmented-item relative flex-1 justify-center min-w-0"
            data-active={ws.id === activeWorkspaceId}
            onClick={() => {
              if (ws.id !== activeWorkspaceId) void setActiveWorkspace(ws.id)
            }}
            title={ws.rootDir}
          >
            <span className="truncate">{ws.name}</span>
            {attention.has(ws.id) && (
              <span className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
        <button
          className="segmented-item flex-shrink-0"
          onClick={() => openSettings('general')}
          title="Manage workspaces"
          aria-label="Manage workspaces"
        >
          <PlusIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
