/**
 * Re-homing (PRDCT-1703 slice 2, §3.6). A live tmux session is hosted by
 * exactly one window; opening a workspace in a new window, or closing a
 * window, MOVES its sessions to another window without killing them.
 *
 * Invariant 11 (open a workspace in a new window): its LIVE tmux sessions
 * re-home there WITH their scrollback (tmux repaint) and leave ZERO tabs in
 * the window that hosted them. Invariant 3 (a window closes): the sessions it
 * hosted re-home to the primary and stay alive and reachable.
 *
 * The sessions are seeded as REAL tmux sessions with a marker written into
 * their scrollback, so "live" and "scrollback preserved" are genuine (a
 * session spawned into a hidden workspace never mounts, so it would have no
 * live pty to move — the realistic re-home is of already-running work). Cross-
 * window clave_send DELIVERY to a session in another window is proven in
 * multi-window-routing.spec.mjs; here the id is shown preserved across the
 * move (addressing survives) and the session stays alive.
 *
 * Two boundaries, on purpose: while the session is HIDDEN-hosted (primary,
 * workspace B not shown) its tab never mounts, so `readSession` — a read of
 * the mounted xterm buffer — correctly refuses ("no terminal buffer"); the
 * scrollback is asserted at the tmux boundary instead (capture-pane by pane
 * id). Only in window B, where the tab mounts, is the marker asserted through
 * the renderer's own buffer — that read IS the repaint proof.
 *
 * Fails if the re-home push is mutated away: the "into B" / "gone from A" pair
 * inverts.
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  callMcpIn,
  identityOf,
  openWindow,
  closeWindow,
  windows,
  killLeakedE2eTmux,
  until,
  tmuxSessionAlive
} from './harness.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = userDataDir('multi-window-rehome')
const ROOT_A = '/tmp/clave-e2e-mw-rehome-a'
const ROOT_B = '/tmp/clave-e2e-mw-rehome-b'
const WS_A = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000e1',
  name: 'RehomeA',
  rootDir: ROOT_A,
  profileFile: null,
  createdAt: 1
}
const WS_B = {
  id: 'bbbbbbbb-0000-4000-8000-0000000000e2',
  name: 'RehomeB',
  rootDir: ROOT_B,
  profileFile: null,
  createdAt: 2
}

const MARKER = 'REHOME-MARKER-9271'
// A live tmux session for workspace B, with a marker echoed into its scrollback.
const SESS = {
  id: '77777777-0000-4000-8000-000000000077',
  tmux: 'clave-e2e-rehome-b',
  cwd: ROOT_B,
  workspaceId: WS_B.id
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const idsIn = (list) => (list?.sessions ?? []).map((s) => s.id)

function seedLiveMarkerSession() {
  // -P -F prints the new pane's id: on tmux 3.7c a bare session name (with or
  // without the `=` exact-match prefix) fails to resolve as a PANE target
  // ("can't find pane") even while the session is alive and healthy — session-
  // level commands (has-session, kill-session) resolve the same name fine.
  // Targeting the pane id sidesteps the resolver entirely.
  const paneId = execFileSync(
    'tmux',
    ['-L', 'clave', 'new-session', '-d', '-P', '-F', '#{pane_id}', '-s', SESS.tmux, '-c', SESS.cwd],
    { encoding: 'utf-8' }
  ).trim()
  execFileSync('tmux', ['-L', 'clave', 'send-keys', '-t', paneId, `echo ${MARKER}`, 'Enter'])
  SESS.paneId = paneId
  const dir = path.join(DIR, 'session-records')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, `${SESS.tmux}.json`),
    JSON.stringify({
      tmuxName: SESS.tmux,
      id: SESS.id,
      cwd: SESS.cwd,
      folderName: path.basename(SESS.cwd),
      claudeMode: false,
      antigravityMode: false,
      codexMode: false,
      claudeAgentsMode: false,
      dangerousMode: false,
      workspaceId: SESS.workspaceId
    })
  )
}

async function untilListed(app, windowId, sessionId, present) {
  return until(async () => {
    const ids = idsIn(await callMcpIn(app, windowId, 'list', {}))
    return ids.includes(sessionId) === present ? ids : null
  })
}
function readMarker(app, windowId) {
  return callMcpIn(app, windowId, 'readSession', {
    sessionId: SESS.id,
    lines: 40,
    callerSessionId: SESS.id
  })
    .then((r) => JSON.stringify(r).includes(MARKER))
    .catch(() => false)
}
/** The marker as tmux itself holds it — the boundary for HIDDEN-hosted phases,
 *  where no tab is mounted and `readSession` correctly has no buffer to read. */
function markerInTmux() {
  try {
    return execFileSync('tmux', ['-L', 'clave', 'capture-pane', '-p', '-t', SESS.paneId], {
      encoding: 'utf-8'
    }).includes(MARKER)
  } catch {
    return false
  }
}

export async function run(t) {
  killLeakedE2eTmux()
  mkdirSync(ROOT_A, { recursive: true })
  mkdirSync(ROOT_B, { recursive: true })
  seedWorkspaces(DIR, { workspaces: [WS_A, WS_B], activeWorkspaceId: WS_A.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT_A, ROOT_B])
  seedLiveMarkerSession()
  await sleep(600) // let the marker echo land in the pane

  let app = null
  try {
    // The primary (window A, workspace A) adopts the live workspace-B session
    // hidden — it hosts every unshown workspace (slice 1).
    const launched = await launchApp(DIR, { settleMs: 6000 })
    app = launched.app
    const winA = launched.win
    const idA = await identityOf(winA)
    t.check(
      'the primary hosts the live workspace-B session hidden',
      !!(await untilListed(app, idA.windowId, SESS.id, true)),
      idsIn(await callMcpIn(app, idA.windowId, 'list', {}))
    )
    t.check(
      'its scrollback marker is in the tmux pane (control, tmux boundary)',
      markerInTmux(),
      'marker in tmux'
    )
    t.check('the tmux session is alive', tmuxSessionAlive(SESS.tmux))

    // ── INVARIANT 11: open window B on workspace B → the session re-homes to it ──
    const b = await openWindow(app, winA, WS_B.id, { settleMs: 2500 })
    t.equal('window B shows workspace B', (await identityOf(b.page))?.workspaceId, WS_B.id)
    const idB = await identityOf(b.page)
    await sleep(2500)
    t.check(
      'the session re-homed INTO window B',
      !!(await untilListed(app, idB.windowId, SESS.id, true)),
      'in B'
    )
    t.check(
      'it left ZERO tabs in window A',
      !!(await untilListed(app, idA.windowId, SESS.id, false)),
      idsIn(await callMcpIn(app, idA.windowId, 'list', {}))
    )
    t.check(
      'its scrollback survived the re-home (tmux repaint)',
      await readMarker(app, idB.windowId),
      'marker in B'
    )
    t.check(
      'the SAME session id was preserved across the move (addressing survives)',
      idsIn(await callMcpIn(app, idB.windowId, 'list', {})).includes(SESS.id),
      'id preserved'
    )
    t.check('the tmux session is still alive after the re-home', tmuxSessionAlive(SESS.tmux))

    // ── INVARIANT 3: close window B → the session re-homes to the primary ──
    await closeWindow(app, b.page)
    t.equal('window B is gone', (await windows(app)).length, 1)
    await sleep(2500)
    t.check(
      'the session re-homed back to the primary on close',
      !!(await untilListed(app, idA.windowId, SESS.id, true)),
      'back in A'
    )
    const listA = await callMcpIn(app, idA.windowId, 'list', {})
    t.check(
      'it is still alive in the primary',
      listA.sessions.find((x) => x.id === SESS.id)?.alive === true,
      'alive'
    )
    t.check(
      'its scrollback is still there (tmux boundary — hidden-hosted, no mounted tab)',
      markerInTmux(),
      'marker after close'
    )
    t.check('the tmux session survived the whole journey', tmuxSessionAlive(SESS.tmux))

    await callMcpIn(app, idA.windowId, 'closeSession', { sessionId: SESS.id }).catch(() => {})
  } finally {
    if (app) await app.close()
    killLeakedE2eTmux()
  }
}
