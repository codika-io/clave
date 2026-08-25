/**
 * The ledger diff (PRDCT-1738): a tab is stamped once per placement identity,
 * a move into a group is a row AT THE MOVE (not at the next hook word), a
 * rename and a `/clear` rotation are rows, a closed tab is a `closed` row
 * carrying its last identity, and the hidden halves (in no group, not in the
 * display order) are never stamped.
 */
import { describe, expect, it } from 'vitest'
import { SessionHistoryDiff, tabSessions, type LayoutState } from './session-history-diff'
import type { Session, SessionGroup } from '../store/session-types'
import type { HistoryLedgerRow } from '../../../preload/index.d'

function session(over: Partial<Session>): Session {
  return {
    id: 's1',
    cwd: '/tmp/proj',
    folderName: 'proj',
    name: 'proj',
    alive: true,
    activityStatus: 'idle',
    promptWaiting: null,
    claudeMode: true,
    antigravityMode: false,
    codexMode: false,
    dangerousMode: false,
    claudeSessionId: 'cc-1',
    sessionType: 'local',
    detectedUrl: null,
    serverStatus: null,
    serverCommand: null,
    hasUnseenActivity: false,
    userRenamed: false,
    planFilePath: null,
    workspaceId: 'ws-1',
    ...over
  }
}

function group(over: Partial<SessionGroup>): SessionGroup {
  return {
    id: 'g1',
    name: 'Alpha',
    sessionIds: [],
    collapsed: false,
    cwd: null,
    terminals: [],
    ...over
  }
}

function harness(): { diff: SessionHistoryDiff; rows: HistoryLedgerRow[] } {
  const rows: HistoryLedgerRow[] = []
  let tick = 0
  const diff = new SessionHistoryDiff(
    (r) => rows.push(r),
    () => `2026-08-25T10:00:0${tick++}.000Z`
  )
  return { diff, rows }
}

describe('SessionHistoryDiff', () => {
  it('stamps a new tab once, then nothing while its identity holds', () => {
    const { diff, rows } = harness()
    const state: LayoutState = { sessions: [session({})], groups: [], displayOrder: ['s1'] }
    diff.apply(state)
    diff.apply({ ...state, sessions: [session({ activityStatus: 'active' })] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'placed',
      sessionId: 's1',
      claudeSessionId: 'cc-1',
      groupId: null,
      mode: 'claude',
      workspaceId: 'ws-1'
    })
  })

  it('a move into a group is a row at the move, carrying the group id and name', () => {
    const { diff, rows } = harness()
    diff.apply({ sessions: [session({})], groups: [], displayOrder: ['s1'] })
    diff.apply({
      sessions: [session({})],
      groups: [group({ sessionIds: ['s1'] })],
      displayOrder: ['g1']
    })
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ kind: 'placed', groupId: 'g1', groupName: 'Alpha' })
  })

  it('a group rename, a tab rename and a /clear rotation each make a row', () => {
    const { diff, rows } = harness()
    const g = group({ sessionIds: ['s1'] })
    diff.apply({ sessions: [session({})], groups: [g], displayOrder: ['g1'] })
    diff.apply({
      sessions: [session({})],
      groups: [{ ...g, name: 'Alpha 2' }],
      displayOrder: ['g1']
    })
    diff.apply({
      sessions: [session({ name: 'fix login' })],
      groups: [{ ...g, name: 'Alpha 2' }],
      displayOrder: ['g1']
    })
    diff.apply({
      sessions: [session({ name: 'fix login', claudeSessionId: 'cc-2' })],
      groups: [{ ...g, name: 'Alpha 2' }],
      displayOrder: ['g1']
    })
    expect(rows.map((r) => [r.groupName, r.name, r.claudeSessionId])).toEqual([
      ['Alpha', 'proj', 'cc-1'],
      ['Alpha 2', 'proj', 'cc-1'],
      ['Alpha 2', 'fix login', 'cc-1'],
      ['Alpha 2', 'fix login', 'cc-2']
    ])
  })

  it('a tab leaving the store is a closed row with its LAST identity', () => {
    const { diff, rows } = harness()
    diff.apply({
      sessions: [session({})],
      groups: [group({ sessionIds: ['s1'] })],
      displayOrder: ['g1']
    })
    diff.apply({ sessions: [], groups: [group({})], displayOrder: ['g1'] })
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      kind: 'closed',
      sessionId: 's1',
      groupId: 'g1',
      groupName: 'Alpha'
    })
    expect(rows[1].ts).not.toBe(rows[0].ts)
    // Gone means gone: no second closed row on the next pass.
    diff.apply({ sessions: [], groups: [group({})], displayOrder: ['g1'] })
    expect(rows).toHaveLength(2)
  })

  it('the hidden halves and remote sessions are not tabs', () => {
    const state: LayoutState = {
      sessions: [
        session({ id: 'tab', claudeSessionId: null, claudeMode: false }),
        session({ id: 'hidden-server' }),
        session({ id: 'remote', sessionType: 'remote-claude' })
      ],
      groups: [group({ sessionIds: ['tab'] })],
      displayOrder: ['g1', 'remote']
    }
    expect(tabSessions(state).map((s) => s.id)).toEqual(['tab'])
    const { diff, rows } = harness()
    diff.apply(state)
    expect(rows.map((r) => r.sessionId)).toEqual(['tab'])
    expect(rows[0].mode).toBe('terminal')
    expect(rows[0].claudeSessionId).toBeNull()
  })

  it('an empty display order is the legacy "every session is a tab"', () => {
    expect(tabSessions({ sessions: [session({})], groups: [], displayOrder: [] })).toHaveLength(1)
  })
})
