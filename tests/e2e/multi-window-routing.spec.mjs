/**
 * MCP routing across windows (PRDCT-1703 slice 2, §3.8). With several windows
 * the sidebar state is partitioned by hosting, so mcp-server resolves WHICH
 * window's renderer runs each call from the caller's per-session token — a
 * path only the real HTTP endpoint exercises (callMcpIn targets one window's
 * dispatcher directly and would bypass the routing under test).
 *
 * Invariants: 8 (a call from a session in window B lands its UI in window B),
 * 9 (a command whose SUBJECT session is in window A runs in A even when the
 * caller is in B), 10 (clave_list scope all reports every session once), and
 * the cross-window NAME resolution (a name-addressed send to a session hosted
 * in the other window delivers — the routing resolves the name across the
 * partitioned stores rather than erroring in the caller's window).
 *
 * Each routing assertion carries its inverse so the spec can fail: the send
 * that must reach the other window would error if the routing fell back to the
 * caller's window (that window's store has no such session).
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  callMcpIn,
  identityOf,
  openWindow,
  windows,
  killLeakedE2eTmux,
  until,
  mcpHttpClient,
  mcpEndpoint,
  spawnAgentTabIn,
  toolPayload,
  toolErrored
} from './harness.mjs'
import { mkdirSync } from 'node:fs'

const DIR = userDataDir('multi-window-routing')
const ROOT_A = '/tmp/clave-e2e-mw-route-a'
const ROOT_B = '/tmp/clave-e2e-mw-route-b'
const WS_A = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000f1',
  name: 'RouteA',
  rootDir: ROOT_A,
  profileFile: null,
  createdAt: 1
}
const WS_B = {
  id: 'bbbbbbbb-0000-4000-8000-0000000000f2',
  name: 'RouteB',
  rootDir: ROOT_B,
  profileFile: null,
  createdAt: 2
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const idsIn = (list) => (list?.sessions ?? []).map((s) => s.id)

export async function run(t) {
  killLeakedE2eTmux()
  mkdirSync(ROOT_A, { recursive: true })
  mkdirSync(ROOT_B, { recursive: true })
  seedWorkspaces(DIR, { workspaces: [WS_A, WS_B], activeWorkspaceId: WS_A.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT_A, ROOT_B])

  let app = null
  const opened = []
  try {
    const launched = await launchApp(DIR, { settleMs: 5000 })
    app = launched.app
    const winA = launched.win
    const idA = await identityOf(winA)
    const url = mcpEndpoint(DIR)

    // ── two windows: A (primary, workspace A) and B (workspace B) ──
    const b = await openWindow(app, winA, WS_B.id, { settleMs: 1500 })
    const idB = await identityOf(b.page)
    t.equal('window B shows workspace B', idB?.workspaceId, WS_B.id)
    t.equal('two windows are open', (await windows(app)).length, 2)

    // Agent tabs (they mint per-session tokens) — one per window.
    const P = await spawnAgentTabIn(app, winA, DIR)
    t.check('an agent tab P minted a token in window A', !!P?.token, P?.sessionId)
    const Q = await spawnAgentTabIn(app, b.page, DIR)
    t.check('an agent tab Q minted a token in window B', !!Q?.token, Q?.sessionId)
    if (!P?.token || !Q?.token) return
    opened.push(P.sessionId, Q.sessionId)
    await sleep(2500)

    const mcpP = mcpHttpClient(url, P.token)
    const mcpQ = mcpHttpClient(url, Q.token)
    await mcpP.init()
    await mcpQ.init()

    // ── INVARIANT 8: a call from Q (window B) lands its UI in window B ──
    const openedInB = toolPayload(
      await mcpQ.call('clave_open_session', { cwd: ROOT_B, mode: 'terminal', name: 'from-Q' })
    )
    t.check('Q opened a session (rule 3: caller window)', !!openedInB?.sessionId, openedInB)
    opened.push(openedInB?.sessionId)
    await sleep(1500)
    const listB = await callMcpIn(app, idB.windowId, 'list', {})
    const listA = await callMcpIn(app, idA.windowId, 'list', {})
    t.check(
      'the new tab landed in window B',
      idsIn(listB).includes(openedInB.sessionId),
      idsIn(listB)
    )
    t.check('and NOT in window A', !idsIn(listA).includes(openedInB.sessionId), idsIn(listA))

    // ── INVARIANT 8 (workspace routing): P opens into workspace B → window B ──
    const childC = toolPayload(
      await mcpP.call('clave_open_session', {
        cwd: ROOT_B,
        mode: 'claude',
        workspace: 'RouteB',
        name: 'childC'
      })
    )
    t.check('P opened childC into workspace B', !!childC?.sessionId, childC)
    opened.push(childC?.sessionId)
    await sleep(2000)
    const listB2 = await callMcpIn(app, idB.windowId, 'list', {})
    t.check(
      'childC (workspace B) landed in window B, not A',
      idsIn(listB2).includes(childC.sessionId),
      idsIn(listB2)
    )

    // ── INVARIANT 9: a subject in window A runs in A though the caller is in B ──
    // Q (window B) focuses P (window A) by id → routed to A, succeeds; if it
    // fell to the caller's window B, B's store has no P and it would error.
    const focusPfromB = await mcpQ.call('clave_focus', { sessionId: P.sessionId })
    t.check(
      'Q focusing P (in window A) by id succeeds — routed to A',
      !toolErrored(focusPfromB),
      focusPfromB
    )
    t.equal('the focus resolved P', toolPayload(focusPfromB)?.focused, P.sessionId)

    // ── INVARIANT 10: clave_list scope all reports every session exactly once ──
    const all = toolPayload(await mcpP.call('clave_list', { workspace: 'all' }))
    const allIds = (all?.sessions ?? []).map((s) => s.id)
    const uniq = new Set(allIds)
    t.equal('clave_list all has no duplicate sessions', allIds.length, uniq.size)
    for (const s of [P.sessionId, Q.sessionId, openedInB.sessionId, childC.sessionId]) {
      t.check(
        `clave_list all includes ${s.slice(0, 8)} exactly once`,
        allIds.filter((x) => x === s).length === 1,
        allIds
      )
    }

    // ── CROSS-WINDOW NAME RESOLUTION + delivery ──
    // P (window A) sends to childC BY NAME; childC is hosted in window B and is
    // P's child (reach-related). The name resolves across windows, routes to B,
    // and delivers. Inverse: a fall-back to the caller's window A errors (A has
    // no "childC").
    const sendByName = toolPayload(
      await mcpP.call('clave_send_to_session', {
        sessionId: 'childC',
        message: 'HELLO-CROSS-WINDOW'
      })
    )
    t.equal('a name-addressed send to the other window delivers', sendByName?.delivered, true)
    t.equal('and it named childC', sendByName?.sessionId, childC.sessionId)
    // delivered:true is returned by the window that HANDLED the send — window B,
    // where childC lives. Had the name fallen back to the caller's window A
    // (which has no childC) it would have errored, so a true delivery IS the
    // cross-window proof; the ambiguous-name rejection below proves the
    // resolve step is doing real cross-window work, not defaulting.

    // ── INVERSE: an ambiguous name across windows is rejected, not guessed ──
    const openedInA = toolPayload(
      await mcpP.call('clave_open_session', { cwd: ROOT_A, mode: 'terminal', name: 'dupe-name' })
    )
    opened.push(openedInA?.sessionId)
    const openedDupB = toolPayload(
      await mcpQ.call('clave_open_session', { cwd: ROOT_B, mode: 'terminal', name: 'dupe-name' })
    )
    opened.push(openedDupB?.sessionId)
    await sleep(1500)
    const ambiguous = await mcpP.call('clave_send_to_session', {
      sessionId: 'dupe-name',
      message: 'x'
    })
    t.check(
      'a name that exists in BOTH windows is rejected as ambiguous',
      toolErrored(ambiguous),
      ambiguous
    )

    for (const sid of opened) {
      if (sid)
        await callMcpIn(app, idA.windowId, 'closeSession', { sessionId: sid }).catch(() => {})
    }
  } finally {
    if (app) await app.close()
    killLeakedE2eTmux()
  }
}
