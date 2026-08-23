import { useSessionStore, type SessionGroup } from '../../store/session-store'
import { ensureGroupTerminalRunning } from '../../lib/group-terminal'
import { WebViewPane } from './WebViewPane'

/**
 * A group's attached web view (group.view) — shown in place of the tiled
 * session mosaic when the group is clicked. Thin adapter over WebViewPane:
 * the start action runs the group terminal that serves the page, and "back"
 * returns to the mosaic. The probe/header/frame machinery lives in the pane.
 */
export function GroupViewPanel({ group }: { group: SessionGroup }): React.JSX.Element | null {
  const setActiveGroupView = useSessionStore((s) => s.setActiveGroupView)
  const view = group.view
  if (!view) return null

  const linkedTerminal = view.terminalId
    ? group.terminals.find((t) => t.id === view.terminalId)
    : undefined

  return (
    <WebViewPane
      url={view.url}
      title={view.title || group.name}
      backLabel="Sessions"
      onBack={() => setActiveGroupView(null)}
      start={
        linkedTerminal
          ? {
              label: `Start ${linkedTerminal.command || 'server'}`,
              run: () => ensureGroupTerminalRunning(group.id, linkedTerminal.id)
            }
          : null
      }
    />
  )
}
