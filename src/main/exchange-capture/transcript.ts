import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import type { BilledCounters, ConversationEntry, TokenSnapshot } from './types'

/**
 * Pure transcript reading for the exchange capture: token-usage summation,
 * Task-sidecar discovery, and the human-layer conversation parse — all from
 * the Claude Code session files on disk. No Electron imports: everything
 * takes explicit paths, so the logic is probe-testable outside the app.
 *
 * Layout (verified against real files, 2026-08-20): root transcript at
 * `~/.claude/projects/<cwd-slug>/<claudeSessionId>.jsonl`; Task-subagent
 * sidecars at `.../<claudeSessionId>/subagents/agent-<agentId>.jsonl`, whose
 * first line is the subagent's launch prompt (a `user` entry). Assistant
 * entries carry per-call `usage` blocks with `input_tokens`, `output_tokens`,
 * `cache_creation_input_tokens`, `cache_read_input_tokens`.
 */

/** Same encoding as title-generator.ts getJsonlPath and
 *  session-export-handlers.ts encodeProjectDir (both module-private). */
function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

export function rootTranscriptPath(cwd: string, claudeSessionId: string): string {
  return path.join(
    homedir(),
    '.claude',
    'projects',
    encodeProjectDir(cwd),
    `${claudeSessionId}.jsonl`
  )
}

export function subagentsDir(cwd: string, claudeSessionId: string): string {
  return path.join(
    homedir(),
    '.claude',
    'projects',
    encodeProjectDir(cwd),
    claudeSessionId,
    'subagents'
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */

interface UsageTotals extends BilledCounters {
  /** Context occupancy read from the last usage-bearing non-sidechain entry. */
  lastContextTokens: number
  lastContextAt: string | null
}

function emptyCounters(): BilledCounters {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    apiCalls: 0
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function parseLines(filePath: string): { objects: any[]; skipped: number } {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const objects: any[] = []
  let skipped = 0
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue
    try {
      objects.push(JSON.parse(line))
    } catch {
      skipped++
    }
  }
  return { objects, skipped }
}

/** Sum the billed usage counters of one transcript file, tracking the latest
 *  non-sidechain usage entry for context occupancy. Throws on a missing or
 *  unreadable file — callers turn that into a loud degradation reason. */
export function readUsageTotals(filePath: string): UsageTotals {
  const { objects } = parseLines(filePath)
  const totals: UsageTotals = { ...emptyCounters(), lastContextTokens: 0, lastContextAt: null }
  for (const o of objects) {
    if (o?.type !== 'assistant') continue
    const usage = o.message?.usage
    if (!usage || typeof usage !== 'object') continue
    const input = num(usage.input_tokens)
    const output = num(usage.output_tokens)
    const cacheCreation = num(usage.cache_creation_input_tokens)
    const cacheRead = num(usage.cache_read_input_tokens)
    totals.inputTokens += input
    totals.outputTokens += output
    totals.cacheCreationTokens += cacheCreation
    totals.cacheReadTokens += cacheRead
    totals.totalTokens += input + output + cacheCreation + cacheRead
    totals.apiCalls++
    // Occupancy = what entered the latest completed call of the ROOT chain
    // (legacy inline sidechain entries are excluded; their windows are
    // separate). Later lines win — transcripts are append-only.
    if (!o.isSidechain) {
      totals.lastContextTokens = input + cacheCreation + cacheRead
      totals.lastContextAt = typeof o.timestamp === 'string' ? o.timestamp : null
    }
  }
  return totals
}

export interface SidecarInfo {
  agentId: string
  transcriptPath: string
  /** The sidecar's first-line timestamp (spawn time), when present. */
  spawnedAt: string | null
  /** The subagent's launch prompt: the sidecar's first user message. */
  prompt: string | null
}

function textOfContent(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const texts = content
      .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text as string)
    if (texts.length > 0) return texts.join('\n')
  }
  return null
}

/** List a session's Task-subagent sidecars with spawn time and launch prompt.
 *  A missing subagents dir means no fan-outs — an empty list, not an error. */
export function listSidecars(dir: string): SidecarInfo[] {
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
  } catch {
    return []
  }
  const sidecars: SidecarInfo[] = []
  for (const file of files.sort()) {
    const transcriptPath = path.join(dir, file)
    const agentId = file.slice('agent-'.length, -'.jsonl'.length)
    let spawnedAt: string | null = null
    let prompt: string | null = null
    try {
      const { objects } = parseLines(transcriptPath)
      const first = objects.find((o) => o?.type === 'user')
      if (first) {
        spawnedAt = typeof first.timestamp === 'string' ? first.timestamp : null
        prompt = textOfContent(first.message?.content)
      }
    } catch {
      // Unreadable sidecar: still report its existence, with what we have.
    }
    sidecars.push({ agentId, transcriptPath, spawnedAt, prompt })
  }
  return sidecars
}

/**
 * Compute a session's token snapshot from its transcript files: billed spend
 * cumulated over the root transcript AND every Task-sidecar (subagent burn is
 * real burn, broken out in `billed.subagents`), plus the root context
 * occupancy. Throws when the root transcript is missing or unreadable.
 */
export function computeTokenSnapshot(cwd: string, claudeSessionId: string): TokenSnapshot {
  const root = readUsageTotals(rootTranscriptPath(cwd, claudeSessionId))
  const subTotals = { ...emptyCounters(), count: 0 }
  for (const sidecar of listSidecars(subagentsDir(cwd, claudeSessionId))) {
    subTotals.count++
    try {
      const t = readUsageTotals(sidecar.transcriptPath)
      subTotals.inputTokens += t.inputTokens
      subTotals.outputTokens += t.outputTokens
      subTotals.cacheCreationTokens += t.cacheCreationTokens
      subTotals.cacheReadTokens += t.cacheReadTokens
      subTotals.totalTokens += t.totalTokens
      subTotals.apiCalls += t.apiCalls
    } catch {
      // Sidecar vanished between listing and reading — count it, sum nothing.
    }
  }
  return {
    computedAt: new Date().toISOString(),
    billed: {
      inputTokens: root.inputTokens + subTotals.inputTokens,
      outputTokens: root.outputTokens + subTotals.outputTokens,
      cacheCreationTokens: root.cacheCreationTokens + subTotals.cacheCreationTokens,
      cacheReadTokens: root.cacheReadTokens + subTotals.cacheReadTokens,
      totalTokens: root.totalTokens + subTotals.totalTokens,
      apiCalls: root.apiCalls + subTotals.apiCalls,
      subagents: subTotals
    },
    contextOccupancy: { tokens: root.lastContextTokens, asOf: root.lastContextAt }
  }
}

/** Operation noise that reaches the transcript as `user` entries without being
 *  something the human said to the agent: slash-command envelopes, `!` bash
 *  passthrough, and their captured output. */
const NON_CONVERSATION_PREFIXES = [
  '<command-name>',
  '<local-command-stdout>',
  '<local-command-stderr>',
  '<bash-input>',
  '<bash-stdout>',
  '<bash-stderr>'
]

function isConversationText(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed !== '' && !NON_CONVERSATION_PREFIXES.some((p) => trimmed.startsWith(p))
}

export interface ConversationResult {
  entries: ConversationEntry[]
  /** Lines that failed to parse as JSON — surfaced, never silently dropped. */
  skippedLines: number
}

/**
 * Parse the human-layer conversation out of a root transcript: the human's
 * messages plus the agent's text blocks, operations stripped (no tool calls,
 * no tool results, no thinking). Agent text is tagged `end-of-turn` when no
 * tool use follows it before the next human message, else `mid-turn`.
 * Throws when the transcript is missing or unreadable.
 */
export function parseConversation(filePath: string, sinceMs?: number): ConversationResult {
  const { objects, skipped } = parseLines(filePath)
  type Item = { kind: 'human' | 'text' | 'tool'; ts: string | null; text: string }
  const items: Item[] = []
  for (const o of objects) {
    if (o?.isSidechain) continue
    const ts = typeof o?.timestamp === 'string' ? o.timestamp : null
    if (o?.type === 'user' && !o.isMeta) {
      const content = o.message?.content
      // A tool_result line is an operation, not something the human typed.
      if (Array.isArray(content) && content.some((b: any) => b?.type === 'tool_result')) continue
      const text = textOfContent(content)
      if (text !== null && isConversationText(text)) items.push({ kind: 'human', ts, text })
    } else if (o?.type === 'assistant' && !o.isApiErrorMessage) {
      const content = o.message?.content
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
          items.push({ kind: 'text', ts, text: block.text })
        } else if (block?.type === 'tool_use') {
          items.push({ kind: 'tool', ts, text: '' })
        }
      }
    }
  }
  // Tag agent text by walking backwards: `sawTool` means a tool use occurs
  // after this block and before the next human message.
  const positions = new Array<'mid-turn' | 'end-of-turn' | null>(items.length).fill(null)
  let sawTool = false
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'human') sawTool = false
    else if (item.kind === 'tool') sawTool = true
    else positions[i] = sawTool ? 'mid-turn' : 'end-of-turn'
  }
  const entries: ConversationEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'tool') continue
    if (sinceMs !== undefined && item.ts !== null && Date.parse(item.ts) < sinceMs) continue
    if (item.kind === 'human') entries.push({ role: 'human', ts: item.ts, text: item.text })
    else entries.push({ role: 'agent', ts: item.ts, text: item.text, position: positions[i]! })
  }
  return { entries, skippedLines: skipped }
}
