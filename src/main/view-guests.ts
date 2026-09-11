import { app, shell, type BrowserWindow } from 'electron'
import { decideNavigation } from '../shared/view-navigation'

/**
 * The web views behind a group's or a session's attached page.
 *
 * A view is an Electron `<webview>`: a guest page with a history of its own,
 * which is what gives the pane its back, forward and home. The guest is also a
 * page nobody vetted, running inside the app's window, so two things are
 * pinned here and nowhere else:
 *
 *  - The guest never gets the app's powers. `will-attach-webview` strips any
 *    preload, keeps node integration off and context isolation on, and only
 *    lets an http(s) page attach at all (the `.html` file views keep their
 *    sandboxed frame and never come through here).
 *  - Where a link goes is decided by `decideNavigation` (shared, unit-tested):
 *    the local machine and the view's own origin stay in the pane, the rest of
 *    the web opens in the system browser, anything else is dropped. Home is the
 *    first entry of the guest's history — the `src` the pane mounted with.
 *    Popups follow the app window's own rule: the system browser, never a new
 *    Electron window.
 */
const HTTP = /^https?:\/\//i

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

export function installViewGuestPolicy(): void {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return

    contents.setWindowOpenHandler(({ url }) => {
      if (HTTP.test(url)) shell.openExternal(url).catch(() => {})
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      const home = contents.navigationHistory.getEntryAtIndex(0)?.url || contents.getURL()
      const decision = decideNavigation(home, url)
      if (decision === 'in-pane') return
      event.preventDefault()
      if (decision === 'external') shell.openExternal(url).catch(() => {})
    })
  })
}
