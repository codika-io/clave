/**
 * Where a link followed inside a view goes.
 *
 * A view (a group's or a session's attached page) is an Electron web view with
 * a history of its own. The page can link anywhere; this is the one rule that
 * decides whether a link stays in the pane (and joins the trail the back and
 * forward arrows walk) or leaves for the system browser. It lives apart from
 * the main-process wiring so both outcomes stay testable without a window:
 *
 *  - `in-pane`: the target is on the local machine (a loopback host — another
 *    exos page on another port, a sibling dev server) or on the origin the view
 *    started on (an https dashboard navigating within itself). Home is always
 *    one click away, so wandering here is safe.
 *  - `external`: any other http(s) URL. The pane is a place, not a browser;
 *    a link to the wider web opens where the user's bookmarks and sessions are,
 *    exactly as a popup from the page already does.
 *  - `deny`: anything that is not http(s) — a custom scheme, `file:`, `javascript:`.
 *    Nothing in a view may reach the app's own protocols or the disk.
 */
export type NavigationDecision = 'in-pane' | 'external' | 'deny'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

const isHttp = (u: URL): boolean => u.protocol === 'http:' || u.protocol === 'https:'

export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return LOOPBACK.has(h) || h.endsWith('.localhost') || h.startsWith('127.')
}

export function decideNavigation(home: string, target: string): NavigationDecision {
  let t: URL
  try {
    t = new URL(target)
  } catch {
    return 'deny'
  }
  if (!isHttp(t)) return 'deny'
  if (isLoopbackHost(t.hostname)) return 'in-pane'
  try {
    const h = new URL(home)
    if (isHttp(h) && h.origin === t.origin) return 'in-pane'
  } catch {
    // an unparseable home only loses the same-origin grant
  }
  return 'external'
}

/**
 * Whether the page the view shows IS its home. A declared home is usually
 * written without a path (`http://127.0.0.1:4756`); the browser reports it as
 * `http://127.0.0.1:4756/`, and a page may add a hash of its own. Same origin,
 * same path (a lone `/` counts as none), same query: home.
 */
export function isAtHome(home: string, current: string): boolean {
  try {
    const h = new URL(home)
    const c = new URL(current)
    const path = (u: URL): string => (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''))
    return h.origin === c.origin && path(h) === path(c) && h.search === c.search
  } catch {
    return false
  }
}
