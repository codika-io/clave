/**
 * Moving between windows (PRDCT-1703). A live tmux session lives in exactly
 * one window; the user (or an agent) can MOVE it to another, and a whole
 * group with it, without killing anything: the tab keeps its id and its
 * scrollback (tmux repaint), leaves ZERO tabs behind, and the record follows
 * the tab to its new window. Closing a window hands its content to the
 * primary the same way.
 *
 * The session is seeded as a REAL tmux session with a marker written into
 * its scrollback and NO window stamp — an orphan the primary adopts at boot
 * (the upgrade case: every record of the previous build is one).
 *
 * Fails if the move is mutated away: the "into 2" / "gone from 1" pair
 * inverts; if the record is not re-stamped: the restart brings the tab back
 * in the wrong window.
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
  tmuxSessionAlive,
  windowLayout
} from './harness.mjs'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = userDataDir('multi-window-move')
const ROOT_A = '/tmp/clave-e2e-mw-move-a'
const ROOT_B = '/tmp/clave-e2e-mw-move-b'
const WS_A = { id: 'aaaaaaaa-0000-4000-8000-0000000000e1', name: 'MoveA', rootDir: ROOT_A, profileFile: null, createdAt: 1 }
const WS_B = { id: 'bbbbbbbb-0000-4000-8000-0000000000e2', name: 'MoveB', rootDir: ROOT_B, profileFile: null, createdAt: 2 }

const MARKER = 'MOVE-MARKER-9271'
const SESS = { id: '77777777-0000-4000-8000-000000000077', tmux: 'clave-e2e-move-b', cwd: ROOT_B, workspaceId: WS_B.id }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const idsIn = (list) => (list?.sessions ?? []).map((s) => s.id)
const groupNamesIn = (list) => (list?.groups ?? []).map((g) => g.name).sort()

function seedLiveMarkerSession() {
  // -P -F prints the new pane's id: a bare session name can fail to resolve
  // as a PANE target on tmux 3.7c; the pane id sidesteps the resolver.
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
function recordOf(id) {
  const dir = path.join(DIR, 'session-records')
  if (!existsSync(dir)) return null
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(path.join(dir, f), 'utf-8'))
    if (r.id === id) return r
  }
  return null
}
async function untilListed(app, windowId, sessionId, present) {
  return until(async () => {
    const ids = idsIn(await callMcpIn(app, windowId, 'list', {}))
    return ids.includes(sessionId) === present ? ids : null
  })
}
function readMarker(app, windowId) {
  return callMcpIn(app, windowId, 'readSession', { sessionId: SESS.id, lines: 40, callerSessionId: SESS.id })
    .then((r) => JSON.stringify(r).includes(MARKER))
    .catch(() => false)
}
/** The marker as tmux itself holds it — the boundary for phases where the
 *  tab is HIDDEN (its workspace not shown by its window): no xterm is mounted,
 *  so `readSession` correctly has no buffer to read. */
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
  await sleep(600)

  let app = null
  try {
    // Window 1 (primary, on A) adopts the unstamped record as an orphan —
    // hidden, since it belongs to workspace B.
    const launched = await launchApp(DIR, { settleMs: 6000 })
    app = launched.app
    const win1 = launched.win
    const id1 = await identityOf(win1)
    t.check('the primary adopted the orphan record (hidden, workspace B)', !!(await untilListed(app, id1.windowId, SESS.id, true)), idsIn(await callMcpIn(app, id1.windowId, 'list', {})))
    t.check('its scrollback marker is in the tmux pane (control)', markerInTmux(), 'marker in tmux')
    t.equal("the adoption stamped the record with window 1's key", recordOf(SESS.id)?.windowKey, id1.windowKey)
    t.check('the tmux session is alive', tmuxSessionAlive(SESS.tmux))

    // ── window 2 on B: the session does NOT move by itself ──
    const w2 = await openWindow(app, win1, WS_B.id, { settleMs: 2500 })
    const id2 = await identityOf(w2.page)
    t.equal('window 2 shows workspace B', id2?.workspaceId, WS_B.id)
    await sleep(1500)
    t.check('opening a window on B does not pull the session there', !idsIn(await callMcpIn(app, id2.windowId, 'list', {})).includes(SESS.id))
    t.check('it is still in window 1', idsIn(await callMcpIn(app, id1.windowId, 'list', {})).includes(SESS.id))

    // ── move the session to window 2 (the sidebar's "Move to window") ──
    const moved = await win1.evaluate(
      ({ ids, target }) => window.electronAPI.windowMoveSessions(ids, target),
      { ids: [SESS.id], target: id2.windowId }
    )
    t.check('main reports the session moved', moved?.moved?.includes(SESS.id) && moved.refused.length === 0, moved)
    t.check('the session is in window 2', !!(await untilListed(app, id2.windowId, SESS.id, true)), 'in 2')
    t.check('and left ZERO tabs in window 1', !!(await untilListed(app, id1.windowId, SESS.id, false)), idsIn(await callMcpIn(app, id1.windowId, 'list', {})))
    t.check('its scrollback survived the move (tmux repaint, read through window 2)', await until(() => readMarker(app, id2.windowId).then((ok) => (ok ? true : null))), 'marker in 2')
    t.check('the SAME id was preserved (addressing survives)', idsIn(await callMcpIn(app, id2.windowId, 'list', {})).includes(SESS.id))
    t.equal("the record now carries window 2's key", recordOf(SESS.id)?.windowKey, id2.windowKey)
    t.check('the tmux session is still alive', tmuxSessionAlive(SESS.tmux))
    t.equal('moving it again to the same window is refused as such', (await win1.evaluate(({ ids, target }) => window.electronAPI.windowMoveSessions(ids, target), { ids: [SESS.id], target: id2.windowId }))?.refused?.[0]?.reason, 'same-window')

    // ── move a whole GROUP back to window 1 ──
    const g = await callMcpIn(app, id2.windowId, 'createGroup', { name: 'Moving group' })
    await callMcpIn(app, id2.windowId, 'moveSession', { sessionId: SESS.id, groupId: g.groupId })
    const list2 = await callMcpIn(app, id2.windowId, 'list', {})
    const groupObj = list2.groups.find((x) => x.id === g.groupId)
    t.check('the group holds the session in window 2', groupObj?.sessionIds.includes(SESS.id), groupObj)
    const groupMoved = await w2.page.evaluate(
      ({ group, target }) => window.electronAPI.windowMoveGroup(group, target),
      {
        group: {
          id: groupObj.id,
          name: groupObj.name,
          sessionIds: groupObj.sessionIds,
          collapsed: false,
          cwd: groupObj.cwd,
          terminals: [],
          workspaceId: groupObj.workspaceId,
          color: groupObj.color
        },
        target: id1.windowId
      }
    )
    t.check('main reports the group move ok', groupMoved?.ok && groupMoved.moved.includes(SESS.id), groupMoved)
    const back1 = await until(async () => {
      const l = await callMcpIn(app, id1.windowId, 'list', {})
      const grp = l.groups.find((x) => x.name === 'Moving group')
      return grp && grp.sessionIds.includes(SESS.id) && idsIn(l).includes(SESS.id) ? l : null
    })
    t.check('window 1 has the group with the session in it', !!back1, groupNamesIn(await callMcpIn(app, id1.windowId, 'list', {})))
    t.check('the session left window 2', !!(await untilListed(app, id2.windowId, SESS.id, false)))
    t.check(
      'and window 2 dropped its copy of the group',
      !!(await until(async () => ((await callMcpIn(app, id2.windowId, 'list', {})).groups.some((x) => x.id === g.groupId) ? null : true)))
    )
    // Window 1 shows workspace A; the workspace-B tab is hidden there (no
    // mounted xterm), so the scrollback is asserted at the tmux boundary.
    t.check('its scrollback survived the group move (tmux boundary — hidden in window 1)', markerInTmux(), 'marker in tmux')

    // ── close window 2 with a group of its own: window 1 takes it in ──
    const g2 = await callMcpIn(app, id2.windowId, 'createGroup', { name: 'Left behind' })
    const s2 = await callMcpIn(app, id2.windowId, 'openSession', { cwd: ROOT_B, mode: 'terminal', groupId: g2.groupId })
    await callMcpIn(app, id2.windowId, 'focus', { sessionId: s2.sessionId })
    await until(() => {
      const name = recordOf(s2.sessionId)?.tmuxName
      return name && tmuxSessionAlive(name) ? name : null
    })
    await sleep(1500)
    await closeWindow(app, w2.page)
    t.equal('window 2 is gone', (await windows(app)).length, 1)
    const took = await until(async () => {
      const l = await callMcpIn(app, id1.windowId, 'list', {})
      const grp = l.groups.find((x) => x.name === 'Left behind')
      return grp && grp.sessionIds.includes(s2.sessionId) && l.sessions.find((x) => x.id === s2.sessionId)?.alive ? l : null
    })
    t.check("window 1 took in window 2's group with its session, alive", !!took, groupNamesIn(await callMcpIn(app, id1.windowId, 'list', {})))
    t.equal("and the record follows to window 1", recordOf(s2.sessionId)?.windowKey, id1.windowKey)
    t.check("window 2's layout file is gone", windowLayout(DIR, id2.windowKey) === null)
    t.check('the marker session survived the whole journey', tmuxSessionAlive(SESS.tmux))

    await callMcpIn(app, id1.windowId, 'closeSession', { sessionId: SESS.id }).catch(() => {})
    await callMcpIn(app, id1.windowId, 'closeSession', { sessionId: s2.sessionId }).catch(() => {})
  } finally {
    if (app) await app.close()
    killLeakedE2eTmux()
  }
}
