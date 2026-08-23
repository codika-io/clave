import { useSessionStore, type Session } from '../../store/session-store'
import { ensureSessionViewServer } from '../../lib/session-view'
import { WebViewPane } from './WebViewPane'

/**
 * A session's attached web view (session.view) — shown in place of the
 * terminal grid when the row's dashboard icon is clicked; "back" (or clicking
 * the row itself) returns to the terminal. The start action respawns the
 * hidden serving session from the view's stored command, so a view survives
 * its server: after a restart the probe finds the page down and one click
 * brings it back.
 */
export function SessionViewPanel({ session }: { session: Session }): React.JSX.Element | null {
  const setActiveSessionView = useSessionStore((s) => s.setActiveSessionView)
  const view = session.view
  if (!view) return null

  return (
    <WebViewPane
      url={view.url}
      title={view.title || session.name}
      backLabel="Terminal"
      onBack={() => setActiveSessionView(null)}
      start={
        view.command
          ? {
              label: `Start ${view.command}`,
              run: () => ensureSessionViewServer(session.id)
            }
          : null
      }
    />
  )
}
