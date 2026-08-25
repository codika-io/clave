import * as fs from 'fs'
import * as readline from 'readline'

/**
 * The scoped transcript search (PRDCT-1738, slice 2): a substring hunt
 * through the transcripts of the sessions the dialog currently lists, one
 * line at a time, in one of three scopes — what the HUMAN said, what the
 * AGENT answered, or the TOOLS it called (a tool_use's name and input, a
 * tool_result's content). Bounded by construction: the caller names the
 * files (a group's worth, tens of megabytes), never the whole store.
 *
 * Streaming, cancellable, capped: each file is read through `readline` so a
 * multi-megabyte transcript costs memory for one line; the search stops at
 * `maxHits` overall and `maxHitsPerSession` per file; an `AbortSignal` stops
 * it between lines. A cheap case-insensitive substring gate on the RAW line
 * runs before any JSON.parse, so a file whose lines never contain the query
 * is parsed zero times.
 *
 * Pure over paths: no Electron, so the unit tests pin the predicates.
 */

export type SearchScope = 'human' | 'agent' | 'tools'

export interface SearchHit {
  claudeSessionId: string
  /** The entry's timestamp, when it carries one. */
  ts: string | null
  scope: SearchScope
  /** A window of the matching text around the first match. */
  excerpt: string
}

export interface SearchFile {
  claudeSessionId: string
  path: string
}

export interface SearchOptions {
  query: string
  scope: SearchScope
  maxHits?: number
  maxHitsPerSession?: number
  signal?: AbortSignal
  /** Called with each batch of hits as a file finishes. */
  onHits?: (hits: SearchHit[]) => void
}

export interface SearchResult {
  hits: SearchHit[]
  filesSearched: number
  /** True when the search stopped early — cancelled or capped. */
  truncated: boolean
}

const EXCERPT_RADIUS = 80

/* eslint-disable @typescript-eslint/no-explicit-any */

function textBlocks(content: unknown, type: string): string[] {
  if (typeof content === 'string') return type === 'text' ? [content] : []
  if (!Array.isArray(content)) return []
  return content
    .filter((b: any) => b?.type === type && typeof b.text === 'string')
    .map((b: any) => b.text as string)
}

function isInjected(text: string): boolean {
  const head = text.trimStart()
  return (
    head.startsWith('<') ||
    head.startsWith('Caveat:') ||
    head.slice(0, 80).includes('system-reminder')
  )
}

/** The searchable texts of one transcript entry in one scope. Empty when the
 *  entry is not of the scope (a tool result in the human scope, thinking in
 *  the agent scope, a subagent's sidechain anywhere). */
export function scopedTexts(entry: any, scope: SearchScope): string[] {
  if (!entry || typeof entry !== 'object' || entry.isSidechain || entry.isMeta) return []
  const content = entry.message?.content
  switch (scope) {
    case 'human': {
      if (entry.type !== 'user' || entry.toolUseResult) return []
      return textBlocks(content, 'text').filter((t) => t.trim() !== '' && !isInjected(t))
    }
    case 'agent': {
      if (entry.type !== 'assistant') return []
      return textBlocks(content, 'text')
    }
    case 'tools': {
      if (entry.type === 'assistant' && Array.isArray(content)) {
        return content
          .filter((b: any) => b?.type === 'tool_use')
          .map((b: any) => `${typeof b.name === 'string' ? b.name : ''} ${safeJson(b.input)}`)
      }
      if (entry.type === 'user' && entry.toolUseResult) {
        if (typeof content === 'string') return [content]
        if (!Array.isArray(content)) return []
        return content
          .filter((b: any) => b?.type === 'tool_result')
          .map((b: any) =>
            typeof b.content === 'string'
              ? b.content
              : Array.isArray(b.content)
                ? b.content
                    .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
                    .map((c: any) => c.text)
                    .join('\n')
                : ''
          )
      }
      return []
    }
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? ''
  } catch {
    return ''
  }
}

/** A window of text around the first case-insensitive match, whitespace
 *  collapsed, with ellipses where it was cut. Null when no match. */
export function excerptAround(text: string, query: string): string | null {
  const lower = text.toLowerCase()
  const at = lower.indexOf(query.toLowerCase())
  if (at === -1) return null
  const start = Math.max(0, at - EXCERPT_RADIUS)
  const end = Math.min(text.length, at + query.length + EXCERPT_RADIUS)
  const middle = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${middle}${end < text.length ? '…' : ''}`
}

/** Search the lines of ONE transcript. Pure over an iterable of lines, so
 *  the tests feed strings and the streamer feeds `readline`. */
export async function searchLines(
  lines: AsyncIterable<string> | Iterable<string>,
  claudeSessionId: string,
  query: string,
  scope: SearchScope,
  limit: number,
  signal?: AbortSignal
): Promise<{ hits: SearchHit[]; aborted: boolean }> {
  const q = query.toLowerCase()
  const hits: SearchHit[] = []
  for await (const line of lines as AsyncIterable<string>) {
    if (signal?.aborted) return { hits, aborted: true }
    if (hits.length >= limit) break
    // The gate: JSON escapes never split a plain word, so a line whose raw
    // text lacks the query cannot contain it in any block.
    if (!line.toLowerCase().includes(q)) continue
    let entry: any
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    for (const text of scopedTexts(entry, scope)) {
      const excerpt = excerptAround(text, query)
      if (excerpt === null) continue
      hits.push({
        claudeSessionId,
        ts: typeof entry.timestamp === 'string' ? entry.timestamp : null,
        scope,
        excerpt
      })
      break
    }
  }
  return { hits, aborted: false }
}

/** Search several transcripts in order, streaming hits per file. */
export async function searchTranscripts(
  files: SearchFile[],
  options: SearchOptions
): Promise<SearchResult> {
  const maxHits = options.maxHits ?? 200
  const perSession = options.maxHitsPerSession ?? 5
  const all: SearchHit[] = []
  let filesSearched = 0
  const query = options.query.trim()
  if (query === '') return { hits: [], filesSearched: 0, truncated: false }
  for (const file of files) {
    if (options.signal?.aborted) return { hits: all, filesSearched, truncated: true }
    if (all.length >= maxHits) return { hits: all, filesSearched, truncated: true }
    let stream: fs.ReadStream
    try {
      stream = fs.createReadStream(file.path, { encoding: 'utf-8' })
    } catch {
      continue
    }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
    let result: { hits: SearchHit[]; aborted: boolean }
    let unreadable = false
    try {
      result = await searchLines(
        rl,
        file.claudeSessionId,
        query,
        options.scope,
        Math.min(perSession, maxHits - all.length),
        options.signal
      )
    } catch {
      // An unreadable file (cleaned up mid-search) contributes nothing and
      // is not counted as searched: `createReadStream` fails lazily, so a
      // missing file surfaces here rather than at open.
      result = { hits: [], aborted: false }
      unreadable = true
    } finally {
      rl.close()
      stream.destroy()
    }
    if (unreadable) continue
    filesSearched++
    if (result.hits.length > 0) {
      all.push(...result.hits)
      options.onHits?.(result.hits)
    }
    if (result.aborted) return { hits: all, filesSearched, truncated: true }
  }
  return { hits: all, filesSearched, truncated: false }
}
