/**
 * A link followed inside a view is never a dead end.
 *
 * The view is an Electron <webview> with a history of its own, and the header
 * carries back, forward and home and names the page the reader is actually on.
 * Before this, the view was an iframe the app could neither read nor drive: a
 * link inside an exos wave page navigated it in place, the header kept the
 * declared title, and nothing brought the wave page back (PRDCT-2247).
 *
 * The spec serves three linked pages from a server of its own and drives the
 * guest from the host (`webview.executeJavaScript`), so every assertion is on
 * what the header shows and what the guest is on — not on the DOM being there.
 * The link policy is asserted at its boundaries: a link to another local
 * port stays in the pane; a link to the wider web opens in the system browser
 * (a stubbed shell.openExternal counts it) and leaves the pane where it was;
 * a 302 to the wider web is treated the same, a 302 to a local page is
 * followed; a file: link does neither; a popup goes to the browser. The
 * guest's confinement is asserted from inside it: no require, no process, no
 * bridge, and a file: src never attaches at all. Delete the `will-navigate` or
 * `will-redirect` handler in view-guests.ts and the matching checks go red;
 * delete the `will-attach-webview` hardening and the confinement checks do.
 */
import { launchApp, seedWorkspaces, seedTrustedRoots, userDataDir, callMcp } from './harness.mjs'
import { mkdirSync } from 'node:fs'
import http from 'node:http'

const DIR = userDataDir('view-navigation')
const ROOT = '/tmp/clave-e2e-view-navigation-root'
const WS = {
  id: 'eeeeeeee-0000-4000-8000-00000000000f',
  name: 'Views',
  rootDir: ROOT,
  profileFile: null,
  createdAt: 1
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Three pages that link each other, plus the two links the policy must refuse. */
function serve() {
  const page = (title, links) =>
    `<html><head><title>${title}</title></head><body>${links
      .map(
        ([href, id, target]) =>
          `<a id="${id}" href="${href}"${target ? ` target="${target}"` : ''}>${id}</a>`
      )
      .join('')}</body></html>`
  const server = http.createServer((req, res) => {
    const routes = {
      '/': page('Home page', [['/second', 'to-second']]),
      '/second': page('Second page', [
        ['/third', 'to-third'],
        ['https://example.com/', 'to-web'],
        ['file:///etc/hosts', 'to-file'],
        ['https://linear.app/antasphere/issue/PRDCT-1', 'to-blank', '_blank']
      ]),
      '/third': page('Third page', [['/', 'to-home']]),
      '/redirects': page('Redirects page', [
        ['/redirect-out', 'to-redirect-out'],
        ['/redirect-local', 'to-redirect-local']
      ])
    }
    const path = req.url.split('?')[0]
    if (path === '/redirect-out') {
      res.writeHead(302, { Location: 'https://example.com/landed' })
      res.end()
      return
    }
    if (path === '/redirect-local') {
      res.writeHead(302, { Location: '/third' })
      res.end()
      return
    }
    const html = routes[path]
    if (!html) {
      res.writeHead(404)
      res.end('nope')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  )
}

/** The header's trail: what it names, where it says the reader is, what is enabled. */
function header(win) {
  return win.evaluate(() => {
    const q = (id) => document.querySelector(`[data-testid="${id}"]`)
    return {
      title: q('view-title')?.textContent ?? null,
      url: q('view-current-url')?.textContent ?? null,
      back: q('view-nav-back') ? !q('view-nav-back').disabled : null,
      forward: q('view-nav-forward') ? !q('view-nav-forward').disabled : null,
      home: q('view-nav-home') ? !q('view-nav-home').disabled : null
    }
  })
}

/** What the guest itself reports — the second witness beside the header. */
function guest(win) {
  return win.evaluate(async () => {
    const wv = document.querySelector('webview')
    if (!wv) return null
    try {
      return { url: wv.getURL(), title: await wv.executeJavaScript('document.title') }
    } catch (e) {
      return { error: String(e) }
    }
  })
}

/** Click a link inside the guest page by its id, AS A USER WOULD: the second
 *  argument of executeJavaScript grants a user gesture. Without it Chromium's
 *  history-manipulation intervention marks the page left behind as skippable
 *  (a script navigated away with no user activation), back does nothing and
 *  canGoBack reads false — the exact symptom under test, produced by the test
 *  itself. Verified 2026-09-11: same click, gesture off → back false with two
 *  history entries; gesture on → back true. */
function clickInGuest(win, id) {
  return win.evaluate(
    (id) =>
      document
        .querySelector('webview')
        .executeJavaScript(`document.getElementById(${JSON.stringify(id)}).click()`, true),
    id
  )
}

/** Wait until the header's url ends with `suffix` — and, when `title` is
 *  given, until the header names it: the title lands on its own event after
 *  the url, and reading it on the url alone was flaky. */
async function untilAt(win, suffix, title = null, ms = 6000) {
  const t0 = Date.now()
  const there = (h) => (h.url ?? '').endsWith(suffix) && (title === null || h.title === title)
  let h = await header(win)
  while (!there(h) && Date.now() - t0 < ms) {
    await sleep(150)
    h = await header(win)
  }
  return h
}

function paneCentreTag(win) {
  return win.evaluate(() => {
    const grid = [...document.querySelectorAll('div')].find((d) =>
      (d.className || '').toString().includes('grid gap-2')
    )
    const pane = grid?.parentElement
    if (!pane) return null
    const r = pane.getBoundingClientRect()
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.tagName ?? null
  })
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])
  const { server, port } = await serve()
  const HOME = `http://127.0.0.1:${port}`

  const { app, win } = await launchApp(DIR)
  try {
    // Count what leaves for the system browser instead of letting it open.
    await app.evaluate(({ shell }) => {
      globalThis.__e2eExternal = []
      shell.openExternal = async (url) => {
        globalThis.__e2eExternal.push(url)
      }
    })
    const external = () => app.evaluate(() => globalThis.__e2eExternal)

    const opened = await callMcp(app, 'openSession', { mode: 'terminal', cwd: ROOT, name: 'nav' })
    const sessionId = opened?.sessionId
    t.check('a session opens to carry the view', typeof sessionId === 'string', opened)
    await sleep(2500)

    await callMcp(app, 'setSessionView', { sessionId, url: HOME, title: 'Nav' })
    await sleep(1000)
    await win.evaluate(() =>
      [...document.querySelectorAll('[data-sidebar-item-type="session"] span[role="button"]')]
        .find((s) => s.getAttribute('title') === 'Nav')
        ?.click()
    )
    let h = await untilAt(win, `${port}/`)
    t.equal(
      'the view is a web view, painted at the centre of the pane',
      await paneCentreTag(win),
      'WEBVIEW'
    )
    t.equal('CONTROL: at home the header names the declared title', h.title, 'Nav')
    t.equal('CONTROL: at home the url is the home url', h.url, `${HOME}/`)
    t.check(
      'CONTROL: at home nothing is enabled — no back, no forward, no home',
      h.back === false && h.forward === false && h.home === false,
      h
    )

    // Follow a link: the trail starts, the header follows the guest.
    await clickInGuest(win, 'to-second')
    h = await untilAt(win, '/second', 'Second page')
    t.equal('following a link shows the new url in the header', h.url, `${HOME}/second`)
    t.equal("and the guest's own title, not the declared one", h.title, 'Second page')
    t.check(
      'back and home light up, forward stays off',
      h.back === true && h.home === true && h.forward === false,
      h
    )
    let g = await guest(win)
    t.equal('the guest agrees it is on the second page', g?.url, `${HOME}/second`)

    // Back returns; forward goes again.
    await win.click('[data-testid="view-nav-back"]')
    h = await untilAt(win, `${port}/`, 'Nav')
    t.equal('back returns to home', h.url, `${HOME}/`)
    t.check(
      'at home again: back off, forward on, home off',
      h.back === false && h.forward === true && h.home === false,
      h
    )
    t.equal('and the title is the declared one again', h.title, 'Nav')
    await win.click('[data-testid="view-nav-forward"]')
    h = await untilAt(win, '/second')
    t.equal('forward goes to the second page again', h.url, `${HOME}/second`)

    // Two deep, home comes back in one click.
    await clickInGuest(win, 'to-third')
    h = await untilAt(win, '/third')
    t.equal('a second link goes deeper', h.url, `${HOME}/third`)
    await win.click('[data-testid="view-nav-home"]')
    h = await untilAt(win, `${port}/`)
    t.equal('home returns from two deep in one click', h.url, `${HOME}/`)
    g = await guest(win)
    t.equal('and the guest is on the home page', g?.title, 'Home page')

    // The policy's boundaries, from the second page.
    await clickInGuest(win, 'to-second')
    h = await untilAt(win, '/second')
    const beforeWeb = await external()
    await clickInGuest(win, 'to-web')
    await sleep(1500)
    const afterWeb = await external()
    t.equal(
      'a link to the wider web opens in the system browser',
      afterWeb.length - beforeWeb.length,
      1
    )
    t.equal('with that url', afterWeb[afterWeb.length - 1], 'https://example.com/')
    g = await guest(win)
    t.equal('and the pane stays where it was', g?.url, `${HOME}/second`)
    h = await header(win)
    t.equal('so does the header', h.url, `${HOME}/second`)

    await clickInGuest(win, 'to-file')
    await sleep(1500)
    t.equal('a file: link opens nothing', (await external()).length, afterWeb.length)
    g = await guest(win)
    t.equal('and moves nothing', g?.url, `${HOME}/second`)

    // The guest is confined: no node, no bridge — a page in a view has no
    // more power than it would in a browser tab.
    const powers = await win.evaluate(() =>
      document
        .querySelector('webview')
        .executeJavaScript(
          '({ require: typeof require, process: typeof process, module: typeof module, bridge: typeof window.electronAPI, node: typeof globalThis.__dirname })'
        )
    )
    t.check(
      'the guest has no node and no bridge',
      Object.values(powers).every((v) => v === 'undefined'),
      powers
    )

    // And no more of the machine than a browser tab would give it — less, in
    // fact: every permission is refused, not asked. Delete the two permission
    // handlers on the view session and this reads "granted" on every row.
    const perms = await win.evaluate(() =>
      document
        .querySelector('webview')
        .executeJavaScript(
          `(async () => { const q = {}; for (const n of ['microphone', 'camera', 'geolocation', 'notifications']) { try { q[n] = (await navigator.permissions.query({ name: n })).state } catch (e) { q[n] = 'ERR ' + e.name } } try { await navigator.mediaDevices.getUserMedia({ audio: true }); q.mic = 'GRANTED' } catch (e) { q.mic = e.name } return q })()`,
          true
        )
    )
    t.check(
      'the guest is refused every permission',
      ['microphone', 'camera', 'geolocation', 'notifications'].every(
        (n) => perms[n] === 'denied'
      ) && perms.mic === 'NotAllowedError',
      perms
    )

    // A file: src never attaches: the tag is created, the guest is not.
    const fileAttach = await win.evaluate(async () => {
      const wv = document.createElement('webview')
      wv.setAttribute('src', 'file:///etc/hosts')
      wv.style.cssText = 'width:200px;height:100px'
      let attached = false
      wv.addEventListener('dom-ready', () => (attached = true))
      document.body.appendChild(wv)
      await new Promise((r) => setTimeout(r, 2000))
      let id = null
      try {
        id = wv.getWebContentsId()
      } catch {
        id = 'no guest'
      }
      wv.remove()
      return { attached, id }
    })
    t.check(
      'a file: src never attaches a guest',
      fileAttach.attached === false && fileAttach.id === 'no guest',
      fileAttach
    )

    // A popup from the page goes to the browser and moves nothing.
    const beforePopup = (await external()).length
    await win.evaluate(() =>
      document
        .querySelector('webview')
        .executeJavaScript("window.open('https://example.com/popup')", true)
    )
    await sleep(1200)
    const afterPopup = await external()
    t.equal('a popup opens in the system browser', afterPopup.length - beforePopup, 1)
    t.equal('with its url', afterPopup[afterPopup.length - 1], 'https://example.com/popup')
    t.equal('and the pane stays where it was', (await guest(win))?.url, `${HOME}/second`)

    // The exos pages open their tasks with target="_blank": same path, same rule.
    await clickInGuest(win, 'to-blank')
    await sleep(1200)
    const afterBlank = await external()
    t.equal(
      'a target=_blank link opens in the system browser',
      afterBlank.length - afterPopup.length,
      1
    )
    t.equal(
      'with its url',
      afterBlank[afterBlank.length - 1],
      'https://linear.app/antasphere/issue/PRDCT-1'
    )
    t.equal('and moves nothing', (await guest(win))?.url, `${HOME}/second`)

    // A redirect is a navigation like any other: out goes to the browser,
    // local is followed.
    await win.evaluate(() =>
      document.querySelector('webview').executeJavaScript("location.assign('/redirects')", true)
    )
    h = await untilAt(win, '/redirects', 'Redirects page')
    const beforeRedirect = (await external()).length
    await clickInGuest(win, 'to-redirect-out')
    await sleep(1500)
    const afterRedirect = await external()
    t.equal(
      'a 302 to the wider web opens in the system browser',
      afterRedirect.length - beforeRedirect,
      1
    )
    t.equal(
      'with the redirect target',
      afterRedirect[afterRedirect.length - 1],
      'https://example.com/landed'
    )
    t.equal(
      'and the pane stays on the page that redirected',
      (await guest(win))?.url,
      `${HOME}/redirects`
    )
    await clickInGuest(win, 'to-redirect-local')
    h = await untilAt(win, '/third', 'Third page')
    t.equal('a 302 to a local page is followed', h.url, `${HOME}/third`)
    t.equal(
      'and nothing more left for the browser',
      (await external()).length,
      afterRedirect.length
    )

    // Back to the second page for the reload check.
    await win.evaluate(() =>
      document.querySelector('webview').executeJavaScript("location.assign('/second')", true)
    )
    h = await untilAt(win, '/second', 'Second page')

    // Reload keeps the trail: still on the second page, back still possible.
    await win.click('button[title="Reload"]')
    await sleep(1500)
    h = await header(win)
    t.equal('reload reloads the page the reader is on, not home', h.url, `${HOME}/second`)
    t.check('and the trail survives it', h.back === true, h)

    // Leaving the view and coming back keeps the page (the pane stays mounted).
    await win.click('.segmented-item:has-text("Terminal")')
    await sleep(800)
    await win.evaluate(() =>
      [...document.querySelectorAll('[data-sidebar-item-type="session"] span[role="button"]')]
        .find((s) => s.getAttribute('title') === 'Nav')
        ?.click()
    )
    await sleep(800)
    h = await header(win)
    t.equal('leaving for the terminal and coming back keeps the page', h.url, `${HOME}/second`)
  } finally {
    await app.close()
    server.close()
  }
}
