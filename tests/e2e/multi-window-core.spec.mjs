/**
 * Multi-window core (PRDCT-1703, slice 1): one workspace per window, each
 * window hosting its own sessions and writing its own layout file.
 *
 * What this pins, on the REAL app with real PTYs:
 *   - a second window opens on another workspace with its own identity, and
 *     opening a workspace already shown somewhere focuses that window instead
 *     of duplicating it (invariant 12);
 *   - a spawn from a window is stamped with THAT window's workspace even when
 *     the state file's last-active workspace says otherwise (invariant 4);
 *   - the two windows write two separate layout files, neither losing the
 *     other's groups (invariant 5), and the legacy single file never appears;
 *   - closing window B leaves window A's session ALIVE AND STREAMING — the
 *     observation is the terminal buffer still advancing after the close,
 *     not process liveness (invariant 1); B's tmux-backed session is
 *     detached, not killed (its process and record survive);
 *   - after a restart the first window comes back on the last-active
 *     workspace, and BOTH workspaces' groups come back from their own files
 *     around the re-adopted sessions (invariant 15's single-window floor plus
 *     the per-workspace half of the restart assertion; the two-window half
 *     needs re-homing, slice 2).
 *
 * Failure modes this must catch: the old whole-app teardown on any close
 * (the streaming assertion goes red), a whole-file layout write (one
 * workspace's file carries the other's group), a spawn stamped from the state
 * file (the stamp assertion goes red), a guard that opens a second window.
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  callMcp,
  callMcpIn,
  windows,
  identityOf,
  openWindow,
  closeWindow,
  killLeakedE2eTmux,
  tmuxSessionAlive
} from './harness.mjs'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = userDataDir('multi-window-core')
const ROOT_A = '/tmp/clave-e2e-mw-core-a'
const ROOT_B = '/tmp/clave-e2e-mw-core-b'
const WS_A = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  name: 'CoreA',
  rootDir: ROOT_A,
  profileFile: null,
  createdAt: 1
}
const WS_B = {
  id: 'bbbbbbbb-0000-4000-8000-0000000000b1',
  name: 'CoreB',
  rootDir: ROOT_B,
  profileFile: null,
  createdAt: 1
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function layoutFile(wsId) {
  return path.join(DIR, 'sidebar-layouts', `${wsId}.json`)
}
function readLayout(wsId) {
  return existsSync(layoutFile(wsId)) ? JSON.parse(readFileSync(layoutFile(wsId), 'utf-8')) : null
}
function groupNames(layout) {
  return (layout?.groups ?? []).map((g) => g.name)
}
function sessionRecords() {
  const dir = path.join(DIR, 'session-records')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf-8')))
}
/** The highest tick number visible in a session's terminal buffer. */
async function lastTick(app, sessionId, windowId) {
  // A read needs a caller identity; a tab may always read itself.
  const read = await callMcpIn(app, windowId, 'readSession', {
    sessionId,
    lines: 40,
    callerSessionId: sessionId
  })
  const text = typeof read === 'string' ? read : JSON.stringify(read)
  const ticks = [...text.matchAll(/tick-(\d+)/g)].map((m) => Number(m[1]))
  return ticks.length ? Math.max(...ticks) : -1
}

export async function run(t) {
  killLeakedE2eTmux()
  mkdirSync(ROOT_A, { recursive: true })
  mkdirSync(ROOT_B, { recursive: true })
  // The OLD key only: the new build reads it as the last-active workspace
  // (the downgrade-compatibility read half of invariant 7).
  seedWorkspaces(DIR, { workspaces: [WS_A, WS_B], activeWorkspaceId: WS_A.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT_A, ROOT_B])

  let app = null
  let sessionA = null
  let sessionB = null
  let sessionA2 = null
  try {
    // ── window A: the primary, on the last-active workspace ──
    const launched = await launchApp(DIR)
    app = launched.app
    const winA = launched.win
    const idA = await identityOf(winA)
    t.equal('the first window shows the last-active workspace', idA?.workspaceId, WS_A.id)
    t.equal('the first window is the primary', idA?.isPrimary, true)
    t.check(
      'alone, the primary hosts every workspace',
      idA?.hostedWorkspaceIds?.includes(WS_A.id) && idA?.hostedWorkspaceIds?.includes(WS_B.id),
      idA?.hostedWorkspaceIds
    )

    // A group with a ticking terminal in A. The loop is the streaming probe.
    const groupA = await callMcp(app, 'createGroup', { name: 'A lane' })
    const opened = await callMcp(app, 'openSession', {
      cwd: ROOT_A,
      mode: 'terminal',
      groupId: groupA.groupId,
      command: 'i=0; while true; do i=$((i+1)); echo tick-$i; sleep 0.2; done',
      autoRun: true
    })
    sessionA = opened.sessionId
    await sleep(3000)
    const t0 = await lastTick(app, sessionA, idA.windowId)
    t.check('the terminal in A is streaming (positive control)', t0 > 0, t0)

    // A DEAD record of workspace A, written after A booted: window B's boot
    // must neither adopt nor prompt for it (the restore prompt is scoped to
    // the window's own workspace; the primary alone sees everyone's).
    const deadId = 'dddddddd-0000-4000-8000-00000000dead'
    mkdirSync(path.join(DIR, 'session-records'), { recursive: true })
    writeFileSync(
      path.join(DIR, 'session-records', `${deadId}.json`),
      JSON.stringify({
        id: deadId,
        cwd: ROOT_A,
        folderName: path.basename(ROOT_A),
        claudeMode: false,
        antigravityMode: false,
        codexMode: false,
        claudeAgentsMode: false,
        dangerousMode: false,
        workspaceId: WS_A.id
      })
    )

    // ── window B on workspace B ──
    const b = await openWindow(app, winA, WS_B.id)
    t.equal('opening workspace B made a NEW window', b.focusedExisting, false)
    const promptInB = await b.page.evaluate(() =>
      (document.body.textContent || '').includes('Restore previous session?')
    )
    t.check("window B did not prompt for workspace A's dead record", !promptInB)
    t.check(
      'the dead record of A is still there for A (B discarded nothing)',
      existsSync(path.join(DIR, 'session-records', `${deadId}.json`))
    )
    rmSync(path.join(DIR, 'session-records', `${deadId}.json`), { force: true })
    const idB = await identityOf(b.page)
    t.equal('window B shows workspace B', idB?.workspaceId, WS_B.id)
    t.equal('window B is not the primary', idB?.isPrimary, false)
    t.check(
      'window B hosts only workspace B',
      JSON.stringify(idB?.hostedWorkspaceIds) === JSON.stringify([WS_B.id]),
      idB?.hostedWorkspaceIds
    )
    const idA2 = await identityOf(winA)
    t.check(
      'the primary no longer hosts workspace B once B shows it',
      idA2?.hostedWorkspaceIds?.includes(WS_A.id) && !idA2?.hostedWorkspaceIds?.includes(WS_B.id),
      idA2?.hostedWorkspaceIds
    )
    t.equal('two windows are open', (await windows(app)).length, 2)

    // The guard: workspace B is shown — asking again focuses, never duplicates.
    const again = await openWindow(app, winA, WS_B.id)
    t.equal('opening a shown workspace reports focusedExisting', again.focusedExisting, true)
    t.equal('and names the window that shows it', again.windowId, idB.windowId)
    t.equal('and opened no window', (await windows(app)).length, 2)

    // The state file's last-active is now B (B was opened last)...
    const stateAfterOpen = JSON.parse(readFileSync(path.join(DIR, 'workspace-state.json'), 'utf-8'))
    t.equal(
      'opening B made it the last-active workspace',
      stateAfterOpen.lastActiveWorkspaceId,
      WS_B.id
    )
    t.equal(
      'the old key mirrors the new one (downgrade safety)',
      stateAfterOpen.activeWorkspaceId,
      WS_B.id
    )

    // ...yet a RAW pty:spawn from A's renderer with no workspace at all is
    // stamped by main from A's window, not from the file (invariant 4 at
    // main's own layer; every renderer path stamps explicitly, this is the
    // fallback a windowed caller gets).
    const rawId = await winA.evaluate(
      (cwd) =>
        window.electronAPI
          .spawnSession(cwd, { claudeMode: false, tmuxMode: false })
          .then((info) => info.id),
      ROOT_A
    )
    await sleep(800)
    const rawRec = sessionRecords().find((r) => r.id === rawId)
    t.equal(
      'a raw spawn from window A is stamped by main with A, not the last-active B',
      rawRec?.workspaceId,
      WS_A.id
    )
    await winA.evaluate((id) => window.electronAPI.killSession(id), rawId)

    // ...and a spawn from A through the dispatcher, with no workspace named, is stamped A too.
    const openedA2 = await callMcpIn(app, idA.windowId, 'openSession', {
      cwd: ROOT_A,
      mode: 'terminal',
      groupId: groupA.groupId
    })
    sessionA2 = openedA2.sessionId
    await sleep(1500)
    const recA2 = sessionRecords().find((r) => r.id === sessionA2)
    t.equal(
      'a spawn from window A is stamped with A, not the last-active B',
      recA2?.workspaceId,
      WS_A.id
    )

    // A group with a session in B, from B's own renderer.
    const groupB = await callMcpIn(app, idB.windowId, 'createGroup', { name: 'B lane' })
    const openedB = await callMcpIn(app, idB.windowId, 'openSession', {
      cwd: ROOT_B,
      mode: 'terminal',
      groupId: groupB.groupId
    })
    sessionB = openedB.sessionId
    await sleep(2500)
    const recB = sessionRecords().find((r) => r.id === sessionB)
    t.equal('a spawn from window B is stamped with B', recB?.workspaceId, WS_B.id)

    // ── two layout files, one per workspace, neither carrying the other's groups ──
    const layoutA = readLayout(WS_A.id)
    const layoutB = readLayout(WS_B.id)
    t.check('workspace A has its own layout file', layoutA !== null, layoutFile(WS_A.id))
    t.check('workspace B has its own layout file', layoutB !== null, layoutFile(WS_B.id))
    t.check(
      "A's file carries A's group and not B's",
      groupNames(layoutA).includes('A lane') && !groupNames(layoutA).includes('B lane'),
      groupNames(layoutA)
    )
    t.check(
      "B's file carries B's group and not A's",
      groupNames(layoutB).includes('B lane') && !groupNames(layoutB).includes('A lane'),
      groupNames(layoutB)
    )
    t.check(
      'the legacy single layout file never appears',
      !existsSync(path.join(DIR, 'sidebar-layout.json'))
    )

    // A cross-workspace write is refused by main, loudly, and writes nothing:
    // B's renderer tries to overwrite A's layout file.
    const rogue = await b.page.evaluate(
      (ws) =>
        window.electronAPI.sidebarLayoutSave(ws, {
          groups: [
            {
              id: 'rogue',
              name: 'Rogue',
              sessionIds: [],
              collapsed: false,
              cwd: null,
              terminals: []
            }
          ],
          displayOrder: ['rogue']
        }),
      WS_A.id
    )
    t.equal("a write to another window's workspace is refused", rogue?.ok, false)
    t.equal('the refusal names the reason', rogue?.reason, 'not-host')
    t.check(
      "and A's file is untouched",
      !groupNames(readLayout(WS_A.id)).includes('Rogue'),
      groupNames(readLayout(WS_A.id))
    )

    // ── close B: A keeps streaming, B's session is detached not killed ──
    const tmuxB = recB?.tmuxName ?? null
    t.check(
      "B's session is tmux-backed (the detach case)",
      !!tmuxB && tmuxSessionAlive(tmuxB),
      tmuxB
    )
    const before = await lastTick(app, sessionA, idA.windowId)
    await closeWindow(app, b.page)
    t.equal('window B is gone', (await windows(app)).length, 1)
    await sleep(1500)
    const after = await lastTick(app, sessionA, idA.windowId)
    t.check("A's terminal kept streaming across B's close", after > before, { before, after })
    const listAfter = await callMcp(app, 'list', {})
    const aAfter = listAfter.sessions.find((s) => s.id === sessionA)
    t.equal("A's session never received pty:exit", aAfter?.alive, true)
    t.check(
      "B's tmux session survived the close (detached, not killed)",
      tmuxSessionAlive(tmuxB),
      tmuxB
    )
    t.check(
      "B's session record survived the close",
      sessionRecords().some((r) => r.id === sessionB)
    )
    const idA3 = await identityOf(winA)
    t.check(
      'the primary hosts workspace B again after B closed',
      idA3?.hostedWorkspaceIds?.includes(WS_B.id),
      idA3?.hostedWorkspaceIds
    )

    // ── restart: the last-active workspace, and both layouts, come back ──
    await app.close()
    app = null
    await sleep(1500)
    const relaunched = await launchApp(DIR, { settleMs: 6000 })
    app = relaunched.app
    const win1 = relaunched.win
    const id1 = await identityOf(win1)
    t.equal(
      'after a restart the first window opens on the last-active workspace',
      id1?.workspaceId,
      WS_B.id
    )
    const listed = await callMcp(app, 'list', {})
    const names = listed.groups.map((g) => g.name)
    t.check("workspace A's group came back from its own file", names.includes('A lane'), names)
    t.check("workspace B's group came back from its own file", names.includes('B lane'), names)
    const gA = listed.groups.find((g) => g.name === 'A lane')
    const gB = listed.groups.find((g) => g.name === 'B lane')
    t.equal("A's group is scoped to A", gA?.workspaceId, WS_A.id)
    t.equal("B's group is scoped to B", gB?.workspaceId, WS_B.id)
    t.check(
      "A's ticking session came back inside its group",
      gA?.sessionIds?.includes(sessionA),
      gA?.sessionIds
    )
    t.check(
      "B's session came back inside its group",
      gB?.sessionIds?.includes(sessionB),
      gB?.sessionIds
    )
    // The primary now holds BOTH workspaces' groups in one store, and still
    // writes each workspace's file with that workspace's groups only.
    await sleep(1500)
    const layoutA2 = readLayout(WS_A.id)
    const layoutB2 = readLayout(WS_B.id)
    t.check(
      "after the restart A's file still carries only A's group",
      groupNames(layoutA2).includes('A lane') && !groupNames(layoutA2).includes('B lane'),
      groupNames(layoutA2)
    )
    t.check(
      "after the restart B's file still carries only B's group",
      groupNames(layoutB2).includes('B lane') && !groupNames(layoutB2).includes('A lane'),
      groupNames(layoutB2)
    )
    const state2 = JSON.parse(readFileSync(path.join(DIR, 'workspace-state.json'), 'utf-8'))
    t.check(
      'the new build writes both keys (one-release downgrade safety)',
      state2.lastActiveWorkspaceId === WS_B.id && state2.activeWorkspaceId === WS_B.id,
      state2
    )

    // Single window: the in-window switch works as it always did.
    await callMcp(app, 'switchWorkspace', { workspace: WS_A.id })
    await sleep(800)
    t.equal('the single window switched to A', (await identityOf(win1))?.workspaceId, WS_A.id)

    // Cleanup: close every session this spec opened (kills their tmux sessions).
    for (const sid of [sessionA, sessionA2, sessionB]) {
      if (sid) await callMcp(app, 'closeSession', { sessionId: sid }).catch(() => {})
    }
  } finally {
    if (app) await app.close()
    killLeakedE2eTmux()
  }
}
