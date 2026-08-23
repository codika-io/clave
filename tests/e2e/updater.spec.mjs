// The updater's surfaces: the pull-able state, the Software Update pane, and
// the native menu.
//
// What this spec is really guarding is recoverability. The updater used to be
// push-only — main fired `update-available` once, five seconds after launch,
// and if the renderer was not listening at that instant the app simply never
// admitted an update existed. There was no way to ask, no manual check, and
// nothing in Settings or the menu bar. Since auto-update is Clave's only
// distribution channel, "the UI forgot" and "you cannot upgrade" were the same
// bug: a 1.68.0 install sat on a published 1.69.0 with no affordance at all.
import { launchApp, userDataDir } from './harness.mjs'

export async function run(t) {
  const dir = userDataDir('updater')
  const { app, win } = await launchApp(dir)

  try {
    // --- The pull path: the fix for the lost push ---
    const state = await win.evaluate(() => window.electronAPI.getUpdaterState())
    t.check('getUpdaterState() answers with a state object', state && typeof state === 'object', state)
    t.check('state carries a phase', typeof state?.phase === 'string', state?.phase)
    t.check(
      'state names the running version',
      typeof state?.currentVersion === 'string' && state.currentVersion.length > 0,
      state?.currentVersion
    )
    t.equal('an unpackaged build reports itself unsupported', state?.supported, false)

    // A manual check must resolve rather than throw, even where the updater
    // cannot run — the pane calls this behind its button.
    const checked = await win.evaluate(() => window.electronAPI.checkForUpdates())
    t.check('checkForUpdates() resolves a state', typeof checked?.phase === 'string', checked)

    // --- The native menu ---
    const menu = await app.evaluate(({ Menu }) => {
      const m = Menu.getApplicationMenu()
      if (!m) return null
      return m.items.map((i) => ({
        label: i.label,
        role: i.role,
        sub: i.submenu ? i.submenu.items.map((s) => s.label).filter(Boolean) : []
      }))
    })
    t.check('an application menu is installed', menu !== null)
    const appMenu = menu?.[0]
    t.check('the app menu offers Check for Updates', !!appMenu?.sub.includes('Check for Updates…'), appMenu?.sub)
    t.check(
      'the app menu offers a direct download',
      !!appMenu?.sub.includes('Download Latest Version…'),
      appMenu?.sub
    )
    // Replacing Electron's default menu means we own the standard items too.
    // Losing these would take ⌘C/⌘V away from every terminal in the app.
    const edit = menu?.find((m) => m.label === 'Edit')
    t.check(
      'the Edit menu survives, so copy and paste still work',
      !!edit && edit.sub.includes('Copy') && edit.sub.includes('Paste'),
      edit?.sub
    )
    const help = menu?.find((m) => m.role === 'help')
    t.check('the Help menu exposes the updater log', !!help?.sub.includes('Open Updater Log'), help?.sub)

    // --- The Software Update pane ---
    await win.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true }))
    )
    await win.waitForTimeout(600)
    const nav = win.getByRole('button', { name: 'Software Update' })
    t.check('Settings lists a Software Update section', (await nav.count()) > 0)

    if (await nav.count()) {
      await nav.first().click()
      await win.waitForTimeout(600)
      const body = await win.locator('body').innerText()
      t.check('the pane names the running version', body.includes(`Clave ${state.currentVersion}`))
      t.check('the pane offers a manual check', body.includes('Check for Updates'))
      // The two escape hatches. Without them a user whose download keeps
      // failing has no way to get the release and nothing to send us.
      t.check('the pane offers the manual install route', body.includes('Open Releases'))
      t.check('the pane offers the updater log', body.includes('Open Log'))
      t.check('a dev build says so instead of pretending', body.includes('disabled in development'))
    }

    // --- The menu drives the renderer to the pane ---
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('menu:open-settings-section', 'updates')
    })
    await win.waitForTimeout(700)
    const after = await win.locator('body').innerText()
    t.check(
      'Check for Updates navigates to the pane where the answer appears',
      after.includes('Software Update') && after.includes('Open Releases')
    )
  } finally {
    await app.close()
  }
}
