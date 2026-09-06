import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { normalizeCodexLimits, readCodexLimits } from './codex-usage'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

describe('Codex quota normalization', () => {
  it('uses actual durations, all buckets, and one copy of the legacy allowance', () => {
    const weekly = { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1789227620 }
    const result = normalizeCodexLimits({
      rateLimits: { primary: weekly },
      rateLimitsByLimitId: {
        spark: {
          limitName: 'Spark',
          primary: { ...weekly, windowDurationMins: 300 },
          secondary: weekly
        },
        codex: { primary: weekly, secondary: null },
        future: { limitName: 'Reserve', primary: { ...weekly, windowDurationMins: 90 } }
      }
    })
    expect(result.windows.map((w) => [w.key, w.label])).toEqual([
      ['codex:primary', 'Weekly'],
      ['spark:primary', '5-hour window · Spark'],
      ['spark:secondary', 'Weekly · Spark'],
      ['future:primary', '90-minute window · Reserve']
    ])
    expect(result.windows[0]).toMatchObject({
      kind: 'weekly_all',
      usedPercentage: 12,
      resetsAt: 1789227620000
    })
  })

  it('handles old servers, zero usage, absent windows, and malformed percentages', () => {
    const result = normalizeCodexLimits({
      rateLimits: {
        primary: { usedPercent: 0, windowDurationMins: 300 },
        secondary: { usedPercent: '80' }
      },
      rateLimitsByLimitId: null
    })
    expect(result.windows).toHaveLength(1)
    expect(result.windows[0]).toMatchObject({ usedPercentage: 0, resetsAt: null, kind: 'session' })
    expect(normalizeCodexLimits({ rateLimits: null }).windows).toEqual([])
    expect(() => normalizeCodexLimits({ unrelated: true })).toThrow('unexpected')
  })

  it('clamps out-of-range usage without making non-finite data look unused', () => {
    expect(
      normalizeCodexLimits({
        rateLimits: {
          primary: { usedPercent: 120 },
          secondary: { usedPercent: NaN }
        }
      }).windows.map((w) => w.usedPercentage)
    ).toEqual([100])
  })
})

describe('Codex read-only connection', () => {
  let child: EventEmitter & {
    stdin: PassThrough
    stdout: PassThrough
    kill: ReturnType<typeof vi.fn>
  }
  let sent: Record<string, unknown>[]
  beforeEach(() => {
    vi.useFakeTimers()
    sent = []
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      kill: vi.fn(() => {
        queueMicrotask(() => child.emit('close', 0))
        return true
      })
    })
    child.stdin.on('data', (data) => sent.push(JSON.parse(data.toString())))
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>)
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })
  const reply = (id: number, result: unknown): void => {
    child.stdout.write(`${JSON.stringify({ id, result })}\n`)
  }

  it('initializes then reads auth and limits without starting any work; handles fragmented output', async () => {
    const result = readCodexLimits()
    expect(sent[0].method).toBe('initialize')
    child.stdout.write('shell startup noise\n{"id":1,"res')
    child.stdout.write('ult":{}}\n')
    reply(2, { account: { type: 'chatgpt' } })
    reply(3, { rateLimits: { primary: { usedPercent: 25, windowDurationMins: 300 } } })
    expect(await result).toMatchObject({ windows: [{ usedPercentage: 25 }] })
    expect(sent.map((m) => m.method)).toEqual([
      'initialize',
      'initialized',
      'account/read',
      'account/rateLimits/read'
    ])
    expect(child.kill).toHaveBeenCalled()
  })

  it('explains API billing without querying subscription quota', async () => {
    const result = readCodexLimits()
    reply(1, {})
    reply(2, { account: { type: 'apiKey' } })
    expect(await result).toMatchObject({
      windows: [],
      message: expect.stringContaining('API billing')
    })
    expect(sent).toHaveLength(3)
  })

  it('returns a sign-in error for unauthenticated users', async () => {
    const result = readCodexLimits()
    reply(1, {})
    reply(2, { account: null, requiresOpenaiAuth: true })
    expect(await result).toMatchObject({ error: expect.stringContaining('Sign in') })
  })

  it('times out and terminates only its own child', async () => {
    const result = readCodexLimits()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await result).toMatchObject({ error: expect.stringContaining('timed out') })
    expect(child.kill).toHaveBeenCalled()
  })

  it('handles a missing executable', async () => {
    const result = readCodexLimits()
    child.emit('error', new Error('ENOENT private path'))
    expect(await result).toMatchObject({ error: expect.stringContaining('installed') })
  })

  it('handles server errors without leaking raw responses', async () => {
    const second = readCodexLimits()
    child.stdout.write(JSON.stringify({ id: 1, error: { message: 'secret raw payload' } }) + '\n')
    expect(await second).toMatchObject({
      error: 'Codex could not initialize. Try updating Codex CLI.'
    })
  })
})
