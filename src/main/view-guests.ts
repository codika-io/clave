import { app, session, shell, type BrowserWindow, type WebContents } from 'electron'
import { decideNavigation } from '../shared/view-navigation'

/**
 * The web views behind a group's or a session's attached page.
 *
 * A view is an Electron `<webview>`: a guest page with a history of its own,
 * which is what gives the pane its back, forward and home. The guest is also a
 * page nobody vetted, running inside the app's window, so three things are
 * pinned here and nowhere else:
 *
 *  - The guest never gets the app's powers. `will-attach-webview` strips any
 *    preload, keeps node integration off and context isolation on, and only
 *    lets an http(s) page attach at all (the `.html` file views keep their
 *    sandboxed frame and never come through here).
 *  - The guest never gets the machine's either. Every guest lives in the
 *    `VIEW_PARTITION` session, whose permission handlers refuse everything —
 *    microphone, camera, notifications, location, clipboard. Electron grants
 *    by default; a dashboard has no business asking.
 *  - Where a link goes is decided by `decideNavigation` (shared, unit-tested):
 *    the local machine and the view's own origin stay in the pane, the rest of
 *    the web opens in the system browser, anything else is dropped. The rule
 *    runs on `will-navigate` AND on every `will-redirect` hop — a 302 is a
 *    navigation like any other, and the one a page cannot be trusted with.
 *    Home is the first entry of the guest's history, the `src` the pane
 *    mounted with. Popups follow the app window's own rule: the system
 *    browser, never a new Electron window.
 *
 * The partition is persistent and shared by every view: cookies and storage
 * behave as in one browser profile, so a dashboard's sign-in survives a
 * restart. What is never persisted is the trail (the history), which is the
 * reader's and dies with the pane.
 */
const HTTP = /^https?:\/\//i

/** The one session every view guest runs in — `WebViewPane` mounts the tag on it. */
export const VIEW_PARTITION = 'persist:view'

export function hardenViewHost(win: BrowserWindow): void {
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    if (!HTTP.test(params.src ?? '')) event.preventDefault()
  })
}

/** Apply the link rule to one navigation of a guest; false = it was stopped. */
function policeNavigation(contents: WebContents, url: string): boolean {
  const home = contents.navigationHistory.getEntryAtIndex(0)?.url || contents.getURL()
  const decision = decideNavigation(home, url)
  if (decision === 'in-pane') return true
  if (decision === 'external') shell.openExternal(url).catch(() => {})
  return false
}

export function installViewGuestPolicy(): void {
  const viewSession = session.fromPartition(VIEW_PARTITION)
  viewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  viewSession.setPermissionCheckHandler(() => false)

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return

    // A popup ALWAYS leaves, local or not, by design: a page that asks for a
    // new window wants the reader to keep this one (a demo guide opening the
    // app it walks through), and the pane has no second window to give it.
    // A plain link is the in-pane path; that is where the trail rule applies.
    contents.setWindowOpenHandler(({ url }) => {
      if (HTTP.test(url)) shell.openExternal(url).catch(() => {})
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      if (!policeNavigation(contents, url)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!policeNavigation(contents, url)) event.preventDefault()
    })
  })
}
