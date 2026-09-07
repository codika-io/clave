/**
 * A rendered HTML page SURVIVES being switched away from and back (PRDCT-2122).
 *
 * The bug: `TerminalGrid` rendered only the SELECTED file tabs, so deselecting an
 * .html tab unmounted its `FileViewer`, its `HtmlPreviewFrame`, and the iframe's
 * whole document. Coming back mounted a fresh one — a full reload. The scroll was
 * at the top again and every piece of state the page held (an open in-page tab, a
 * filter, a chart's zoom) was back to its initial value. Nothing errored; the page
 * just silently started over. The terminals one loop above have always done the
 * opposite — render all, hide the unselected — which is the only reason a terminal
 * survives a tab switch.
 *
 * WHAT THIS SPEC HAS TO ASSERT, and why the obvious check is worthless: "an iframe
 * is present after coming back" passes just as happily on the broken code, because
 * a remount also leaves an iframe in the DOM. So does "the src is right". The only
 * question that separates fixed from broken is whether it is the SAME LIVE
 * DOCUMENT, and there are two independent ways to see that from the parent, both
 * used below:
 *
 *   1. ELEMENT IDENTITY. Stamp an expando on the iframe element before switching
 *      away. React re-creates the DOM node on remount, so a surviving stamp means
 *      the element was never destroyed.
 *   2. LOAD COUNT. The `load` event fires on the iframe element and is observable
 *      cross-origin (the frame is an opaque origin — sandbox without
 *      allow-same-origin — so its scroll and its internals are NOT readable, which
 *      is exactly why the fix has to preserve the document rather than restore it).
 *      A document that reloaded fires load again. Still 1 means it never reloaded.
 *
 * Both are checked after a REAL tab switch driven through the store the sidebar
 * writes, and a CONTROL asserts the page genuinely reloads when it should (an
 * explicit reload bumps the count), so a counter wired to nothing cannot read as a
 * pass.
 *
 * MUTATION-TESTED. Restoring the bug in `TerminalGrid.tsx` — filtering the file-tab
 * loop back down to the selected ids — turns 5 of these 16 assertions red, and
 * which 5 is the point: "coming back, the preview is there" and "at a usable size"
 * stay GREEN on the broken code. Those are the checks a spec written the obvious
 * way would have made, and they would have shipped the bug.
 *
 * What this spec does NOT pin down, deliberately, is the `visibility: hidden`
 * choice: swapping it for `display: none` leaves every assertion here green,
 * because Chromium keeps a display:none iframe's document and scroll alive too.
 * That choice is about the layout box (a frame with no box comes back needing a
 * re-layout, so a page that sizes itself on resize redoes that work every switch),
 * not about survival, and it is written down as such in TerminalGrid.tsx rather
 * than asserted here as something it is not.
 */
import { launchApp, seedWorkspaces, seedTrustedRoots, userDataDir, callMcp } from './harness.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = userDataDir('html-preview-state')
const ROOT = '/tmp/clave-e2e-html-preview-state-root'
const PAGE = `${ROOT}/report.html`
const OTHER = `${ROOT}/other.txt`
const WS = {
  id: 'eeeeeeee-0000-4000-8000-0000000000a2',
  name: 'Previews',
  rootDir: ROOT,
  profileFile: null,
  createdAt: 1
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The preview iframe, its identity stamp, and how many times it has loaded. */
function frameState(win) {
  return win.evaluate(() => {
    const f = document.querySelector('iframe[src^="clave-preview://"]')
    if (!f) return { present: false }
    return {
      present: true,
      stamp: f.__e2eStamp ?? null,
      loads: f.__e2eLoads ?? null,
      src: f.getAttribute('src'),
      // Is it still laid out? A frame collapsed to zero comes back needing a
      // full re-layout, which is the reload this change exists to remove.
      width: f.getBoundingClientRect().width,
      height: f.getBoundingClientRect().height
    }
  })
}

/** Mark the current iframe and start counting its loads. */
function stampFrame(win, stamp) {
  return win.evaluate((s) => {
    const f = document.querySelector('iframe[src^="clave-preview://"]')
    if (!f) return false
    f.__e2eStamp = s
    // It has already loaded once by now; count from there.
    f.__e2eLoads = 1
    f.addEventListener('load', () => {
      f.__e2eLoads = (f.__e2eLoads ?? 0) + 1
    })
    return true
  }, stamp)
}

/** Click a tab's real sidebar row — the same path the user takes. Returns false
 *  if the row is not there, so a spec fails on a bad selector instead of
 *  silently asserting against a switch that never happened. */
function clickSidebarTab(win, id) {
  return win.evaluate((tabId) => {
    const row = document.querySelector(`[data-sidebar-item-id="${tabId}"] button`)
    if (!row) return false
    row.click()
    return true
  }, id)
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  // A page tall enough to scroll and holding state of its own, so what it stands
  // for in the report — a dashboard with tabs — is what is actually on screen.
  writeFileSync(
    PAGE,
    `<html><body style="margin:0">
       <div style="height:4000px;background:linear-gradient(#123456,#654321)">
         <h1 id="h">E2E-PREVIEW-STATE</h1>
       </div>
       <script>window.__bootCount = (window.__bootCount || 0) + 1</script>
     </body></html>`
  )
  writeFileSync(OTHER, 'a second tab to switch to\n')
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])

  const { app, win } = await launchApp(DIR)
  try {
    // Open the HTML page as a file tab, rendered.
    const openedHtml = await callMcp(app, 'openFile', { path: PAGE, view: 'rendered' })
    const htmlTabId = openedHtml?.fileTabId
    t.check('the .html opens as a file tab', typeof htmlTabId === 'string', openedHtml)
    await sleep(2500)

    const first = await frameState(win)
    t.check('and renders through the clave-preview protocol', first.present, first)
    t.check('at a usable size', (first.width ?? 0) > 100 && (first.height ?? 0) > 100, first)
    t.check('the frame accepts an identity stamp', await stampFrame(win, 'ORIGINAL'), first)

    // CONTROL — the counter is wired to something real. Force a reload the way
    // the app does (a new key on the frame) and the count must move. Without
    // this, a load counter that never fires would make every "still 1" below
    // pass on broken code.
    await win.evaluate(() => {
      const f = document.querySelector('iframe[src^="clave-preview://"]')
      f.src = f.src // eslint-disable-line no-self-assign
    })
    await sleep(1500)
    const reloaded = await frameState(win)
    t.equal('CONTROL: a real reload is observed by the counter', reloaded.loads, 2)
    t.equal('CONTROL: and the element itself survives a reload', reloaded.stamp, 'ORIGINAL')

    // Re-stamp from a known baseline for the assertions that matter.
    await win.evaluate(() => {
      const f = document.querySelector('iframe[src^="clave-preview://"]')
      f.__e2eLoads = 1
    })

    // Open a SECOND tab and switch to it — a real switch through the store the
    // sidebar writes, which is what deselects the html tab.
    const openedOther = await callMcp(app, 'openFile', { path: OTHER })
    const otherTabId = openedOther?.fileTabId
    t.check('a second file tab opens to switch to', typeof otherTabId === 'string', openedOther)
    await sleep(1500)

    const clickedAway = await clickSidebarTab(win, otherTabId)
    t.check("the second tab's sidebar row is clickable", clickedAway, otherTabId)
    await sleep(2000)

    // THE ASSERTIONS. Same element, no new load — the document never died.
    const back0 = await frameState(win)
    t.check('the preview frame is still mounted while another tab is shown', back0.present, back0)
    t.equal('and it is the SAME element (never unmounted)', back0.stamp, 'ORIGINAL')
    t.equal('and it never reloaded while hidden', back0.loads, 1)

    // Switch back to the HTML tab.
    const clickedBack = await clickSidebarTab(win, htmlTabId)
    t.check("the html tab's sidebar row is clickable", clickedBack, htmlTabId)
    await sleep(2000)

    const back = await frameState(win)
    t.check('coming back, the preview is there', back.present, back)
    t.equal('it is STILL the same element — no remount', back.stamp, 'ORIGINAL')
    t.equal('and it never reloaded across the switch', back.loads, 1)
    t.check(
      'and it is laid out at a usable size again',
      (back.width ?? 0) > 100 && (back.height ?? 0) > 100,
      back
    )
  } finally {
    await app.close()
  }
}
