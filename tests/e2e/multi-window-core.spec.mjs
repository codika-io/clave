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
 *   - the windows write separate layout files, none losing another's groups
 *     (invariant 5): a window that starts hosting a workspace — at its own
 *     boot, after an in-window switch, or when another window closes —
 *     reads that workspace's file before it may write it, and a group whose
 *     sessions merely live elsewhere is kept, never written back as gone;
 *   - a cross-workspace write is refused by main, loudly;
 *   - a secondary window's restore prompt lists only ITS workspace's dead
 *     records (invariant 13) — with the positive control that it does prompt
 *     for its own;
 *   - closing window B leaves window A's session ALIVE AND STREAMING — the
 *     observation is the terminal buffer still advancing after the close,
 *     not process liveness (invariant 1); B's tmux-backed session is
 *     detached, not killed (its process and record survive);
 *   - after a restart the first window comes back on the last-active
 *     workspace, and every workspace's groups come back from their own files
 *     around the re-adopted sessions (invariant 15's single-window floor plus
 *     the per-workspace half of the restart assertion; the two-window half
 *     needs re-homing, slice 2).
 *
 * Failure modes this must catch: the old whole-app teardown on any close
 * (the streaming assertion goes red), a whole-file layout write, a window
 * writing a workspace it never read (the seed groups vanish from disk), a
 * spawn stamped from the state file, a guard that opens a second window, an
 * unfiltered restore prompt.
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
  tmuxSessionAlive,
  until
} from './harness.mjs'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = userDataDir('multi-window-core')
const ROOT_A = '/tmp/clave-e2e-mw-core-a'
const ROOT_B = '/tmp/clave-e2e-mw-core-b'
const ROOT_C = '/tmp/clave-e2e-mw-core-c'
const ws = (letter, root) => ({
  id: `${letter}${letter}${letter}${letter}${letter}${letter}${letter}${letter}-0000-4000-8000-0000000000${letter}1`,
  name: `Core${letter.toUpperCase()}`,
  rootDir: root,
  profileFile: null,
  createdAt: 1
})
const WS_A = ws('a', ROOT_A)
const WS_B = ws('b', ROOT_B)
const WS_C = ws('c', ROOT_C)

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
function writeDeadRecord(id, root, workspaceId) {
  mkdirSync(path.join(DIR, 'session-records'), { recursive: true })
  writeFileSync(
    path.join(DIR, 'session-records', `${id}.json`),
    JSON.stringify({
      id,
      cwd: root,
      folderName: path.basename(root),
      claudeMode: false,
      antigravityMode: false,
      codexMode: false,
      claudeAgentsMode: false,
      dangerousMode: false,
      workspaceId
    })
  )
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
/** Wait until a layout file lists exactly these group names (order-free). */
async function untilGroups(wsId, names) {
  return until(() => {
    const got = groupNames(readLayout(wsId)).sort()
    return JSON.stringify(got) === JSON.stringify([...names].sort()) ? got : null
  })
}

export async function run(t) {
  killLeakedE2eTmux()
  for (const r of [ROOT_A, ROOT_B, ROOT_C]) mkdirSync(r, { recursive: true })
  // The OLD key only: the new build reads it as the last-active workspace
  // (the downgrade-compatibility read half of invariant 7).
  seedWorkspaces(DIR, { workspaces: [WS_A, WS_B, WS_C], activeWorkspaceId: WS_A.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT_A, ROOT_B, ROOT_C])

  let app = null
  const opened = []
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
      [WS_A.id, WS_B.id, WS_C.id].every((w) => idA?.hostedWorkspaceIds?.includes(w)),
      idA?.hostedWorkspaceIds
    )

    // A group with a ticking terminal in A. The loop is the streaming probe.
    const groupA = await callMcp(app, 'createGroup', { name: 'A lane' })
    const tick = await callMcp(app, 'openSession', {
      cwd: ROOT_A,
      mode: 'terminal',
      groupId: groupA.groupId,
      command: 'i=0; while true; do i=$((i+1)); echo tick-$i; sleep 0.2; done',
      autoRun: true
    })
    opened.push(tick.sessionId)
    // Seed groups in B and C from the primary, which hosts them hidden: their
    // files must survive every hosting hand-over below.
    for (const [name, root, wsx] of [
      ['B seed', ROOT_B, WS_B],
      ['C seed', ROOT_C, WS_C]
    ]) {
      const g = await callMcp(app, 'createGroup', { name, workspace: wsx.id })
      const s = await callMcp(app, 'openSession', {
        cwd: root,
        mode: 'terminal',
        groupId: g.groupId,
        workspace: wsx.id
      })
      opened.push(s.sessionId)
    }
    await sleep(3000)
    const t0 = await lastTick(app, tick.sessionId, idA.windowId)
    t.check('the terminal in A is streaming (positive control)', t0 > 0, t0)
    t.check(
      "the primary wrote B's seed group to B's file",
      !!(await untilGroups(WS_B.id, ['B seed'])),
      groupNames(readLayout(WS_B.id))
    )
    t.check(
      "the primary wrote C's seed group to C's file",
      !!(await untilGroups(WS_C.id, ['C seed'])),
      groupNames(readLayout(WS_C.id))
    )

    // DEAD records for A and B, written after A booted: window B's boot must
    // prompt for B's and neither adopt nor prompt for A's.
    // Plain records are keyed by a UUID — a malformed id is pruned as junk.
    const deadA = 'dddddddd-0000-4000-8000-00000000dea0'
    const deadB = 'dddddddd-0000-4000-8000-00000000deb0'
    writeDeadRecord(deadA, ROOT_A, WS_A.id)
    writeDeadRecord(deadB, ROOT_B, WS_B.id)

    // ── window B on workspace B ──
    const b = await openWindow(app, winA, WS_B.id, { settleMs: 1000 })
    t.equal('opening workspace B made a NEW window', b.focusedExisting, false)
    const prompt = await until(() =>
      b.page.evaluate(() => {
        const text = document.body.textContent || ''
        return text.includes('Restore previous session?') ? text : null
      })
    )
    t.check('window B prompted for its own dead record (positive control)', prompt !== null)
    t.check(
      "and the prompt lists ONE terminal — B's, not A's",
      !!prompt && prompt.includes('1 terminal') && !prompt.includes('2 terminals'),
      prompt?.slice(
        prompt.indexOf('Restore previous session?'),
        prompt.indexOf('Restore previous session?') + 120
      )
    )
    await b.page.click('button:has-text("Start fresh")')
    await sleep(2500)
    t.check(
      'B discarded its own dead record',
      !existsSync(path.join(DIR, 'session-records', `${deadB}.json`))
    )
    t.check(
      "and left A's dead record alone",
      existsSync(path.join(DIR, 'session-records', `${deadA}.json`))
    )
    rmSync(path.join(DIR, 'session-records', `${deadA}.json`), { force: true })

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

    // B took over workspace B WITHOUT truncating its file: the seed group,
    // whose session lives in the primary, is still there.
    t.check(
      "B's file still carries the seed group after B's boot",
      groupNames(readLayout(WS_B.id)).includes('B seed'),
      groupNames(readLayout(WS_B.id))
    )
    const listB = await callMcpIn(app, idB.windowId, 'list', { workspace: WS_B.id })
    t.check(
      'and B shows it as a group (its session lives elsewhere for now)',
      listB.groups.some((g) => g.name === 'B seed'),
      listB.groups.map((g) => g.name)
    )

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
    opened.push(openedA2.sessionId)
    await sleep(1500)
    const recA2 = sessionRecords().find((r) => r.id === openedA2.sessionId)
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
    opened.push(openedB.sessionId)
    await sleep(2500)
    const recB = sessionRecords().find((r) => r.id === openedB.sessionId)
    t.equal('a spawn from window B is stamped with B', recB?.workspaceId, WS_B.id)

    // ── one layout file per workspace, none carrying another's groups ──
    t.check(
      "A's file carries A's group and not B's",
      !!(await untilGroups(WS_A.id, ['A lane'])),
      groupNames(readLayout(WS_A.id))
    )
    t.check(
      "B's file carries the seed AND B's own group, nothing of A",
      !!(await untilGroups(WS_B.id, ['B seed', 'B lane'])),
      groupNames(readLayout(WS_B.id))
    )
    t.check(
      'the legacy single layout file never appears',
      !existsSync(path.join(DIR, 'sidebar-layout.json'))
    )

    // A cross-workspace write is refused by main, loudly, and writes nothing:
    // B's renderer tries to overwrite A's layout file.
    const rogue = await b.page.evaluate(
      (wsId) =>
        window.electronAPI.sidebarLayoutSave(wsId, {
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

    // ── B switches to C (unshown): it must READ C's file before writing it ──
    await callMcpIn(app, idB.windowId, 'switchWorkspace', { workspace: WS_C.id })
    await until(() => identityOf(b.page).then((id) => (id?.workspaceId === WS_C.id ? id : null)))
    t.equal('window B now shows workspace C', (await identityOf(b.page))?.workspaceId, WS_C.id)
    await sleep(1000)
    const groupCfromB = await callMcpIn(app, idB.windowId, 'createGroup', { name: 'C from B' })
    const openedC = await callMcpIn(app, idB.windowId, 'openSession', {
      cwd: ROOT_C,
      mode: 'terminal',
      groupId: groupCfromB.groupId
    })
    opened.push(openedC.sessionId)
    t.check(
      "C's file keeps the seed group next to the one B added",
      !!(await untilGroups(WS_C.id, ['C seed', 'C from B'])),
      groupNames(readLayout(WS_C.id))
    )
    t.check(
      "B's file kept both of B's groups after B left it",
      JSON.stringify(groupNames(readLayout(WS_B.id)).sort()) ===
        JSON.stringify(['B lane', 'B seed']),
      groupNames(readLayout(WS_B.id))
    )

    // ── close B: A keeps streaming, B's sessions are detached not killed,
    //    and A regains C without clobbering what B wrote ──
    // Its tmux session is created when the tab mounts; focus it, then poll.
    await callMcpIn(app, idB.windowId, 'focus', { sessionId: openedC.sessionId })
    const tmuxC = await until(() => {
      const name = sessionRecords().find((r) => r.id === openedC.sessionId)?.tmuxName
      return name && tmuxSessionAlive(name) ? name : null
    })
    t.check("B's session is tmux-backed and running (the detach case)", tmuxC !== null, tmuxC)
    const before = await lastTick(app, tick.sessionId, idA.windowId)
    await closeWindow(app, b.page)
    t.equal('window B is gone', (await windows(app)).length, 1)
    await sleep(1500)
    const after = await lastTick(app, tick.sessionId, idA.windowId)
    t.check("A's terminal kept streaming across B's close", after > before, { before, after })
    const listAfter = await callMcp(app, 'list', {})
    const aAfter = listAfter.sessions.find((s) => s.id === tick.sessionId)
    t.equal("A's session never received pty:exit", aAfter?.alive, true)
    t.check(
      "B's tmux session survived the close (detached, not killed)",
      tmuxSessionAlive(tmuxC),
      tmuxC
    )
    t.check(
      "B's session record survived the close",
      sessionRecords().some((r) => r.id === openedC.sessionId)
    )
    const idA3 = await identityOf(winA)
    t.check(
      'the primary hosts B and C again after B closed',
      idA3?.hostedWorkspaceIds?.includes(WS_B.id) && idA3?.hostedWorkspaceIds?.includes(WS_C.id),
      idA3?.hostedWorkspaceIds
    )
    // A change in A now: C's file must still hold what B wrote there. The
    // group carries a session so it survives the restart below (an empty
    // group has nothing to restore around).
    const groupA2 = await callMcp(app, 'createGroup', { name: 'A second' })
    const openedA3 = await callMcp(app, 'openSession', {
      cwd: ROOT_A,
      mode: 'terminal',
      groupId: groupA2.groupId
    })
    opened.push(openedA3.sessionId)
    await sleep(2000)
    t.check(
      "A's file gained the new group next to the first",
      !!(await untilGroups(WS_A.id, ['A lane', 'A second'])),
      groupNames(readLayout(WS_A.id))
    )
    t.check(
      "C's file still carries what B wrote (A re-read it before writing)",
      JSON.stringify(groupNames(readLayout(WS_C.id)).sort()) ===
        JSON.stringify(['C from B', 'C seed']),
      groupNames(readLayout(WS_C.id))
    )
    t.check(
      "B's file is intact too",
      JSON.stringify(groupNames(readLayout(WS_B.id)).sort()) ===
        JSON.stringify(['B lane', 'B seed']),
      groupNames(readLayout(WS_B.id))
    )

    // ── restart: the last-active workspace, and every layout, come back ──
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
      WS_C.id
    )
    // The first window shows C. Its restore prompt is scoped to C (§3.6): the
    // C-seed session was spawned into a hidden workspace and never mounted, so
    // it comes back as a dead record and is offered here — and ONLY it, not
    // B's dead seed, which waits for B to be opened (its group stays a shell).
    // Answer Restore so C seed relaunches; boot then finishes restoring.
    const restartPrompt = await until(() =>
      win1.evaluate(() => {
        const text = document.body.textContent || ''
        return text.includes('Restore previous session?') ? text : null
      })
    )
    t.check('the restart prompt is scoped to the shown workspace (C)', restartPrompt !== null)
    t.check(
      'and offers ONE terminal — C-seed, not B-seed',
      !!restartPrompt &&
        restartPrompt.includes('1 terminal') &&
        !restartPrompt.includes('2 terminals'),
      restartPrompt?.slice(
        restartPrompt.indexOf('Restore previous session?'),
        restartPrompt.indexOf('Restore previous session?') + 120
      )
    )
    await win1.click('button:has-text("Restore")')
    await sleep(2500)
    const expected = [
      ['A lane', WS_A, tick.sessionId],
      ['A second', WS_A, openedA3.sessionId],
      ['B seed', WS_B, opened[1]], // hidden-hosted shell: group kept, dead record awaits B opening
      ['B lane', WS_B, openedB.sessionId], // live, adopted hidden
      ['C seed', WS_C, null], // relaunched fresh, new id
      ['C from B', WS_C, openedC.sessionId]
    ]
    // Adoption of every survivor races the machine load; poll until the store
    // holds every group rather than sampling once.
    const listed =
      (await until(async () => {
        const l = await callMcp(app, 'list', {})
        return expected.every(([name]) => l.groups.some((g) => g.name === name)) ? l : null
      })) ?? (await callMcp(app, 'list', {}))
    const names = listed.groups.map((g) => g.name)
    for (const [name, wsx, sid] of expected) {
      const g = listed.groups.find((x) => x.name === name)
      t.check(
        `"${name}" came back from its own file, scoped to its workspace`,
        g?.workspaceId === wsx.id,
        { names, g }
      )
      if (sid)
        t.check(`and its session is in "${name}"`, !!g?.sessionIds?.includes(sid), g?.sessionIds)
    }
    // The primary now holds every workspace's groups in one store, and still
    // writes each workspace's file with that workspace's groups only.
    await sleep(1500)
    t.check(
      "after the restart A's file carries only A's groups",
      JSON.stringify(groupNames(readLayout(WS_A.id)).sort()) ===
        JSON.stringify(['A lane', 'A second']),
      groupNames(readLayout(WS_A.id))
    )
    t.check(
      "after the restart B's file carries only B's groups",
      JSON.stringify(groupNames(readLayout(WS_B.id)).sort()) ===
        JSON.stringify(['B lane', 'B seed']),
      groupNames(readLayout(WS_B.id))
    )
    t.check(
      "after the restart C's file carries only C's groups",
      JSON.stringify(groupNames(readLayout(WS_C.id)).sort()) ===
        JSON.stringify(['C from B', 'C seed']),
      groupNames(readLayout(WS_C.id))
    )
    const state2 = JSON.parse(readFileSync(path.join(DIR, 'workspace-state.json'), 'utf-8'))
    t.check(
      'the new build writes both keys (one-release downgrade safety)',
      state2.lastActiveWorkspaceId === WS_C.id && state2.activeWorkspaceId === WS_C.id,
      state2
    )

    // Single window: the in-window switch works as it always did.
    await callMcp(app, 'switchWorkspace', { workspace: WS_A.id })
    await sleep(800)
    t.equal('the single window switched to A', (await identityOf(win1))?.workspaceId, WS_A.id)

    // Cleanup: close every session this spec opened (kills their tmux sessions).
    for (const sid of opened) {
      await callMcp(app, 'closeSession', { sessionId: sid }).catch(() => {})
    }
  } finally {
    if (app) await app.close()
    killLeakedE2eTmux()
  }
}
