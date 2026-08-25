/**
 * The session history's pure core (PRDCT-1738): the ledger's round trip and
 * its refusal of malformed rows, the fold (one entry per transcript, every
 * group a session lived in, the last row winning scalars, the capture seed
 * never erasing a stamped workspace, closed then re-placed = open), the
 * group match by id or name, and the transcript peek over a fixture tail
 * (title, last prompt, last human timestamp, tool results and injected
 * context excluded, a missing file = not resumable rather than a throw).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionLedger, normalizeLedgerRow, type LedgerRow } from './ledger'
import { captureEventsToRows, entryInGroup, foldHistory } from './index'
import { locateTranscript, peekTranscript, scanTail, transcriptPath } from './transcript-peek'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clave-history-test-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function row(over: Partial<LedgerRow>): LedgerRow {
  return {
    v: 1,
    kind: 'placed',
    ts: '2026-08-25T10:00:00.000Z',
    sessionId: 'tab-1',
    claudeSessionId: 'cc-1',
    name: 'first ask',
    cwd: '/tmp/proj',
    mode: 'claude',
    model: null,
    workspaceId: 'ws-1',
    groupId: 'g-1',
    groupName: 'Alpha',
    ...over
  }
}

describe('SessionLedger', () => {
  it('round-trips rows and counts (never drops) malformed lines', () => {
    const ledger = new SessionLedger(join(tmp, 'session-history'))
    ledger.append(row({}))
    ledger.append(row({ kind: 'closed', ts: '2026-08-25T11:00:00.000Z' }))
    writeFileSync(ledger.filePath(), '{"v":1,"kind":"placed"}\nnot json\n', { flag: 'a' })
    const { rows, skippedLines } = ledger.readAll()
    expect(rows.map((r) => r.kind)).toEqual(['placed', 'closed'])
    expect(skippedLines).toBe(2)
  })

  it('an absent file is an empty ledger', () => {
    expect(new SessionLedger(join(tmp, 'nope')).readAll()).toEqual({ rows: [], skippedLines: 0 })
  })

  it('normalizeLedgerRow re-picks fields and refuses the malformed', () => {
    const extra = { ...row({}), smuggled: 'x' } as unknown
    expect(normalizeLedgerRow(extra)).toEqual(row({}))
    expect(normalizeLedgerRow({ ...row({}), kind: 'moved' })).toBeNull()
    expect(normalizeLedgerRow({ ...row({}), mode: 'gemini' })).toBeNull()
    expect(normalizeLedgerRow({ ...row({}), ts: 'yesterday' })).toBeNull()
    expect(normalizeLedgerRow({ ...row({}), sessionId: undefined })).toBeNull()
    expect(normalizeLedgerRow(null)).toBeNull()
  })
})

describe('foldHistory', () => {
  it('one entry per transcript; a terminal (no transcript) is folded away', () => {
    const entries = foldHistory([
      row({}),
      row({ claudeSessionId: null, sessionId: 'term', mode: 'terminal' })
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].claudeSessionId).toBe('cc-1')
  })

  it('keeps every group the session lived in, first seen first, with the latest name', () => {
    const entries = foldHistory([
      row({ ts: '2026-08-25T10:00:00.000Z' }),
      row({ ts: '2026-08-25T10:30:00.000Z', groupId: 'g-2', groupName: 'Beta' }),
      row({ ts: '2026-08-25T10:40:00.000Z', groupId: 'g-1', groupName: 'Alpha renamed' })
    ])
    expect(entries[0].groups).toEqual([
      { id: 'g-1', name: 'Alpha renamed', firstAt: '2026-08-25T10:00:00.000Z' },
      { id: 'g-2', name: 'Beta', firstAt: '2026-08-25T10:30:00.000Z' }
    ])
  })

  it('the last row wins scalars whatever the input order; closed then re-placed is open', () => {
    const entries = foldHistory([
      row({ ts: '2026-08-25T12:00:00.000Z', name: 'renamed', sessionId: 'tab-2' }),
      row({ ts: '2026-08-25T11:00:00.000Z', kind: 'closed' }),
      row({ ts: '2026-08-25T10:00:00.000Z' })
    ])
    expect(entries[0].name).toBe('renamed')
    expect(entries[0].sessionId).toBe('tab-2')
    expect(entries[0].closedAt).toBeNull()
    expect(entries[0].firstSeenAt).toBe('2026-08-25T10:00:00.000Z')
    expect(entries[0].lastSeenAt).toBe('2026-08-25T12:00:00.000Z')
    const closed = foldHistory([row({}), row({ ts: '2026-08-25T11:00:00.000Z', kind: 'closed' })])
    expect(closed[0].closedAt).toBe('2026-08-25T11:00:00.000Z')
  })

  it('the capture seed never erases a stamped workspace', () => {
    const seed = captureEventsToRows([
      {
        kind: 'session_state',
        ts: '2026-08-22T10:00:00.000Z',
        session: {
          sessionId: 'tab-1',
          name: 'seeded',
          mode: 'claude',
          cwd: '/tmp/proj',
          claudeSessionId: 'cc-1',
          groupId: 'g-0',
          groupName: 'Old'
        }
      },
      { kind: 'message', ts: '2026-08-22T10:01:00.000Z' },
      {
        kind: 'tab_closed',
        ts: '2026-08-22T11:00:00.000Z',
        session: {
          sessionId: 'tab-1',
          name: 'seeded',
          mode: 'claude',
          cwd: '/tmp/proj',
          claudeSessionId: 'cc-1',
          groupId: null,
          groupName: null
        }
      },
      { kind: 'session_state', ts: '2026-08-22T12:00:00.000Z', session: { name: 'no id' } }
    ])
    expect(seed).toHaveLength(2)
    expect(seed[0].workspaceId).toBeNull()
    expect(seed[1].kind).toBe('closed')
    const entries = foldHistory([...seed, row({ ts: '2026-08-25T10:00:00.000Z' })])
    expect(entries[0].workspaceId).toBe('ws-1')
    expect(entries[0].groups.map((g) => g.id)).toEqual(['g-0', 'g-1'])
    // A stamped row carrying no workspace keeps the one already known.
    const kept = foldHistory([row({}), row({ ts: '2026-08-25T11:00:00.000Z', workspaceId: null })])
    expect(kept[0].workspaceId).toBe('ws-1')
  })

  it('entryInGroup matches by id or by name — a relaunched pin keeps its history', () => {
    const [entry] = foldHistory([row({})])
    expect(entryInGroup(entry, { id: 'g-1', name: 'whatever' })).toBe(true)
    expect(entryInGroup(entry, { id: 'g-9', name: 'Alpha' })).toBe(true)
    expect(entryInGroup(entry, { id: 'g-9', name: 'Beta' })).toBe(false)
    const [nameless] = foldHistory([row({ groupName: null })])
    expect(entryInGroup(nameless, { id: 'g-9', name: '' })).toBe(false)
  })
})

const TAIL = [
  JSON.stringify({
    type: 'user',
    timestamp: '2026-08-25T09:00:00.000Z',
    message: { content: '<command-name>/clear</command-name>' }
  }),
  JSON.stringify({
    type: 'user',
    timestamp: '2026-08-25T09:01:00.000Z',
    message: { content: [{ type: 'text', text: 'Please fix the login bug' }] }
  }),
  JSON.stringify({ type: 'ai-title', aiTitle: 'Login bug fix' }),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-25T09:02:00.000Z',
    message: { content: [{ type: 'text', text: 'On it' }] }
  }),
  JSON.stringify({
    type: 'user',
    timestamp: '2026-08-25T09:03:00.000Z',
    toolUseResult: true,
    message: { content: [{ type: 'tool_result', content: 'ok' }] }
  }),
  JSON.stringify({
    type: 'user',
    timestamp: '2026-08-25T09:04:00.000Z',
    isSidechain: true,
    message: { content: 'subagent prompt' }
  }),
  JSON.stringify({
    type: 'user',
    timestamp: '2026-08-25T09:05:00.000Z',
    message: { content: '<system-reminder>injected</system-reminder>' }
  }),
  JSON.stringify({ type: 'last-prompt', lastPrompt: 'Please fix the login bug' }),
  'this line is not json'
].join('\n')

describe('transcript peek', () => {
  it('scanTail reads the title, the last prompt and the last HUMAN timestamp', () => {
    const scan = scanTail(TAIL)
    expect(scan.title).toBe('Login bug fix')
    expect(scan.lastPrompt).toBe('Please fix the login bug')
    // Not 09:03 (a tool result), not 09:04 (a subagent), not 09:05 (injected).
    expect(scan.lastHumanAt).toBe('2026-08-25T09:01:00.000Z')
  })

  it('the last occurrence wins for the title', () => {
    const text = [
      JSON.stringify({ type: 'ai-title', aiTitle: 'first' }),
      JSON.stringify({ type: 'ai-title', aiTitle: 'second' })
    ].join('\n')
    expect(scanTail(text).title).toBe('second')
  })

  it('peekTranscript reads only the tail of a large file, dropping the cut line', () => {
    const file = join(tmp, 'big.jsonl')
    const filler = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'x'.repeat(2000) }] }
    })
    const lines = [JSON.stringify({ type: 'ai-title', aiTitle: 'early title' })]
    for (let i = 0; i < 60; i++) lines.push(filler) // ~120 KB of filler
    lines.push(TAIL)
    writeFileSync(file, lines.join('\n') + '\n')
    const peek = peekTranscript(file)
    expect(peek.exists).toBe(true)
    expect(peek.title).toBe('Login bug fix')
    expect(peek.lastPrompt).toBe('Please fix the login bug')
    expect(peek.lastHumanAt).toBe('2026-08-25T09:01:00.000Z')
    expect(peek.sizeBytes).toBeGreaterThan(64 * 1024)
  })

  it('a title only in the head is found by the wider second read', () => {
    const file = join(tmp, 'headtitle.jsonl')
    const filler = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'y'.repeat(2000) }] }
    })
    const lines = [
      JSON.stringify({
        type: 'user',
        timestamp: '2026-08-25T08:00:00.000Z',
        message: { content: 'the ask' }
      }),
      JSON.stringify({ type: 'ai-title', aiTitle: 'head title' })
    ]
    for (let i = 0; i < 60; i++) lines.push(filler)
    writeFileSync(file, lines.join('\n') + '\n')
    const peek = peekTranscript(file)
    expect(peek.title).toBe('head title')
    expect(peek.lastHumanAt).toBe('2026-08-25T08:00:00.000Z')
  })

  it('a missing transcript is exists:false, never a throw', () => {
    expect(peekTranscript(join(tmp, 'gone.jsonl')).exists).toBe(false)
    expect(peekTranscript(null).exists).toBe(false)
  })

  it('locateTranscript finds the direct path, else one under another project dir, and refuses a traversal', () => {
    const root = join(tmp, 'projects')
    const direct = transcriptPath(root, '/tmp/proj', 'cc-1')
    mkdirSync(join(root, '-tmp-proj'), { recursive: true })
    writeFileSync(direct, '')
    expect(locateTranscript(root, '/tmp/proj', 'cc-1')).toBe(direct)
    mkdirSync(join(root, '-elsewhere'), { recursive: true })
    writeFileSync(join(root, '-elsewhere', 'cc-2.jsonl'), '')
    expect(locateTranscript(root, '/tmp/proj', 'cc-2')).toBe(join(root, '-elsewhere', 'cc-2.jsonl'))
    expect(locateTranscript(root, '/tmp/proj', 'cc-3')).toBeNull()
    expect(locateTranscript(root, '/tmp/proj', '../../etc/passwd')).toBeNull()
  })
})
