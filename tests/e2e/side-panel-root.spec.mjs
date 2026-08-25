/**
 * The side panel's root: workspace, group, or session.
 *
 * The panel only ever knew the focused tab's folder, so with no tab focused it
 * drew nothing at all — a blank panel beside a sidebar full of groups — and a
 * tab deep in one repo had no way to look at the workspace around it short of
 * the folder picker. The path bar's root chip is the fix, and this spec pins
 * the four things it promises:
 *
 * 1. With no session focused the panel roots at the WORKSPACE, and lists it.
 * 2. The default is a ladder: a focused session's own folder first, then its
 *    group's, then the workspace — a session inside a group still opens on its
 *    own folder, the group is one click up.
 * 3. Each rung is greyed when there is nothing on it: a tab outside any group
 *    has no group rung, an empty window has neither group nor session.
 * 4. The choice is remembered PER SESSION: switch A to the workspace, B to its
 *    group, and focusing each brings its own back. Closing both lands on the
 *    workspace again.
 *
 * The fixture is a plain folder tree, no git — the Files tab is enough to see
 * which folder the panel is pointed at, and the git tab reads the same `cwd`.
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  callMcp
} from './harness.mjs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = userDataDir('side-panel-root')
const ROOT = '/private/tmp/clave-e2e-side-panel-root-scope'
const APPS = path.join(ROOT, 'apps')
const ONE = path.join(APPS, 'one')
const TWO = path.join(APPS, 'two')
// The group comes from a .clave, as real groups do: that is the path that gives
// a group a folder of its own (an agent's createGroup makes a bare one).
const CLAVE = path.join(ROOT, 'apps.clave')
const WS = {
  id: 'eeeeeeee-0000-4000-8000-00000000000e',
  name: 'Scoped',
  rootDir: ROOT,
  profileFile: CLAVE,
  createdAt: 1
}

function seedTree() {
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(ONE, { recursive: true })
  mkdirSync(TWO, { recursive: true })
  writeFileSync(path.join(ROOT, 'README.md'), '# root\n')
  writeFileSync(path.join(ONE, 'one.txt'), 'one\n')
  writeFileSync(path.join(TWO, 'two.txt'), 'two\n')
  writeFileSync(
    CLAVE,
    JSON.stringify(
      {
        $schema: 'clave/1.0',
        name: 'Apps',
        cwd: 'apps',
        sessions: [
          {
            cwd: 'apps/two',
            name: 'two',
            claudeMode: false,
            antigravityMode: false,
            codexMode: false,
            dangerousMode: false
          }
        ],
        terminals: []
      },
      null,
      2
    )
  )
}

/** The chip's rung, the path bar's text, and the names in the tree. */
function readPanel(win) {
  return win.evaluate(() => {
    const bar = document.querySelector('[data-panel-bar="path"]')
    const chip = bar?.querySelector('[data-panel-scope]')
    return {
      scope: chip?.getAttribute('data-panel-scope') ?? null,
      path: bar?.textContent.trim() ?? '',
      rows: [...document.querySelectorAll('[data-tree-item]')].map((e) => e.textContent.trim()),
      home: !!bar?.querySelector('[aria-label^="Back to"]')
    }
  })
}

const has = (rows, name) => rows.some((r) => r.includes(name))

/** Open the chip's menu and read its rows. Leaves the menu open. */
async function openMenu(win) {
  await win.click('[data-panel-bar="path"] [data-panel-scope]')
  await win.waitForTimeout(300)
  return win.evaluate(() =>
    [...document.querySelectorAll('[data-panel-scope-menu] [data-scope-option]')].map((b) => ({
      option: b.dataset.scopeOption,
      disabled: b.disabled,
      selected: b.dataset.selected === 'true',
      hint: b.querySelector('.menu-hint')?.textContent.trim() ?? null
    }))
  )
}

const rung = (menu, option) => menu.find((m) => m.option === option)

async function pick(win, option) {
  await win.click(`[data-panel-scope-menu] [data-scope-option="${option}"]`)
  await win.waitForTimeout(900)
}

export async function run(t) {
  seedTree()
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])

  const { app, win } = await launchApp(DIR)
  try {
    // ── 1. An empty window roots at the workspace ─────────────────────────
    await win.click('button[title^="File tree"]')
    await win.waitForTimeout(1500)

    const empty = await readPanel(win)
    t.equal('with no session focused, the panel roots at the workspace', empty.scope, 'workspace')
    t.check('and the path names the workspace root', empty.path.includes('side-panel-root-scope'), empty.path)
    t.check(
      'and the tree lists the workspace, not nothing',
      has(empty.rows, 'README.md') && has(empty.rows, 'apps'),
      empty.rows
    )

    let menu = await openMenu(win)
    t.equal('the menu offers the three rungs and the folder picker', menu.length, 4)
    t.check(
      'with no session, group and session are greyed and workspace is the one lit',
      rung(menu, 'workspace')?.disabled === false &&
        rung(menu, 'workspace')?.selected === true &&
        rung(menu, 'group')?.disabled === true &&
        rung(menu, 'session')?.disabled === true,
      menu
    )
    t.check('the folder picker is the last row', menu[menu.length - 1]?.option === 'folder', menu)
    await win.keyboard.press('Escape')
    await win.waitForTimeout(200)
    t.equal(
      'Escape closes it',
      await win.evaluate(() => document.querySelectorAll('[data-panel-scope-menu]').length),
      0
    )

    // ── 2. A session roots the panel at its own folder ────────────────────
    const a = await callMcp(app, 'openSession', { cwd: ONE, mode: 'terminal', name: 'one' })
    await win.waitForTimeout(1800)
    const onA = await readPanel(win)
    t.equal('a focused session roots the panel at its own folder', onA.scope, 'session')
    t.check(
      'and the tree is that folder — not the workspace',
      has(onA.rows, 'one.txt') && !has(onA.rows, 'README.md'),
      onA.rows
    )

    // ── 3. Outside any group, the group rung is greyed ────────────────────
    menu = await openMenu(win)
    t.check(
      'a tab outside any group has no group rung to climb to',
      rung(menu, 'group')?.disabled === true && rung(menu, 'group')?.hint === 'not in a group',
      menu
    )
    t.check(
      'session is the lit rung and workspace is open',
      rung(menu, 'session')?.selected === true && rung(menu, 'workspace')?.disabled === false,
      menu
    )
    t.check(
      'each open rung names the folder it resolves to',
      rung(menu, 'session')?.hint === 'one' &&
        rung(menu, 'workspace')?.hint === 'clave-e2e-side-panel-root-scope',
      menu
    )

    // Climb to the workspace: the tree follows, and no "way home" arrow appears
    // — a root is not a navigation, there is nothing to go back from.
    await pick(win, 'workspace')
    const aOnW = await readPanel(win)
    t.equal('picking workspace re-roots the panel', aOnW.scope, 'workspace')
    t.check('and the tree is the workspace again', has(aOnW.rows, 'README.md'), aOnW.rows)
    t.check('a root switch is not a navigation: no way-home arrow', aOnW.home === false, aOnW)

    // ── 4. Inside a group: the ladder still starts on the session ─────────
    await callMcp(app, 'launchGroup', { group: 'Apps' })
    await win.waitForTimeout(3500)
    const listed = await callMcp(app, 'list', {})
    const inGroup = (listed.sessions ?? listed).find((s) => s.groupId)
    t.check('the .clave group launched with its session', !!inGroup, listed)
    const b = { sessionId: inGroup.id }
    await callMcp(app, 'focus', { sessionId: b.sessionId })
    await win.waitForTimeout(1200)
    const onB = await readPanel(win)
    t.equal('a session inside a group still opens on its own folder', onB.scope, 'session')
    t.check('with its own tree', has(onB.rows, 'two.txt'), onB.rows)

    menu = await openMenu(win)
    t.check(
      'but the group rung is open now, and names the group’s folder',
      rung(menu, 'group')?.disabled === false && rung(menu, 'group')?.hint === 'apps',
      menu
    )
    await pick(win, 'group')
    const bOnG = await readPanel(win)
    t.equal('picking group re-roots the panel at the group’s folder', bOnG.scope, 'group')
    t.check(
      'and the tree is the group’s folder: both apps, not the workspace',
      has(bOnG.rows, 'one') && has(bOnG.rows, 'two') && !has(bOnG.rows, 'README.md'),
      bOnG.rows
    )

    // ── 5. Remembered per session ─────────────────────────────────────────
    await callMcp(app, 'focus', { sessionId: a.sessionId })
    await win.waitForTimeout(900)
    const backOnA = await readPanel(win)
    t.equal('focusing A brings back A’s choice (workspace)', backOnA.scope, 'workspace')
    t.check('with the workspace tree', has(backOnA.rows, 'README.md'), backOnA.rows)

    await callMcp(app, 'focus', { sessionId: b.sessionId })
    await win.waitForTimeout(900)
    const backOnB = await readPanel(win)
    t.equal('focusing B brings back B’s choice (group)', backOnB.scope, 'group')
    t.check('with the group tree', has(backOnB.rows, 'one') && has(backOnB.rows, 'two'), backOnB.rows)

    // A choice is for the session it was made on: a fresh tab starts on the
    // ladder, not on whatever the last tab was switched to.
    const c = await callMcp(app, 'openSession', { cwd: ONE, mode: 'terminal', name: 'three' })
    await win.waitForTimeout(1800)
    const onC = await readPanel(win)
    t.equal('a new session starts on the default rung, not the last one picked', onC.scope, 'session')

    // ── 6. Closing every session lands on the workspace again ─────────────
    for (const s of [a, b, c]) await callMcp(app, 'closeSession', { sessionId: s.sessionId })
    await win.waitForTimeout(1500)
    const closed = await readPanel(win)
    t.equal('with every session closed, the panel is back on the workspace', closed.scope, 'workspace')
    t.check('and lists it', has(closed.rows, 'README.md'), closed.rows)
  } finally {
    await app.close().catch(() => {})
    rmSync(ROOT, { recursive: true, force: true })
  }
}
