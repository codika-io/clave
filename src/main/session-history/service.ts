import * as path from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import { CaptureStore } from '../exchange-capture/store'
import { SessionLedger, normalizeLedgerRow } from './ledger'
import { captureEventsToRows, foldHistory, unknownStems, type HistoryEntry } from './index'
import {
  indexTranscripts,
  locateTranscript,
  PeekCache,
  type TranscriptPeek
} from './transcript-peek'
import { searchTranscripts, type SearchHit, type SearchScope } from './search'

/**
 * Session-history service: the main-process owner of the ledger and the one
 * reader of the history (PRDCT-1738).
 *
 * `stamp` is fire-and-forget from the renderer's store diff — a ledger
 * failure is logged, never thrown back into a store update. `list` folds the
 * ledger (plus the exchange-capture stream as the pre-ledger seed) into one
 * entry per Claude session and decorates each with a peek at its
 * transcript's tail: title, last prompt, last human timestamp, and whether
 * the file is still on disk (Claude Code cleans transcripts after
 * `cleanupPeriodDays`, 30 by default; a cleaned session stays listed, greyed).
 *
 * The transcripts root is `~/.claude/projects` unless `CLAVE_TRANSCRIPTS_ROOT`
 * names another directory — the E2E harness's way of seeding transcripts
 * without touching the real store. Peeks are cached per (path, size, mtime)
 * (`PeekCache`: a stat per file, a read only when it moved), and the root's
 * transcripts are indexed once per list rather than probed once per miss.
 */

export interface HistoryListEntry extends HistoryEntry {
  /** Where the entry comes from: the ledger (a conversation Clave ran), or
   *  a transcript the store holds that Clave never saw ("Everything"). */
  source: 'ledger' | 'transcript'
  /** The store dir a synthesized entry was found under — the workspace
   *  fallback when its transcript carries no cwd at all. */
  projectDir?: string
  transcript: TranscriptPeek
  /** The row's title: Claude Code's own title when the tail carries one, else
   *  the tab's name as the ledger last saw it. */
  title: string
  /** Best "last human message" time: the transcript's, else the ledger's
   *  last sighting, else the file's mtime. Always set, so the sort is total. */
  lastHumanAt: string
}

let ledger: SessionLedger | null = null
let capture: CaptureStore | null = null
const peekCache = new PeekCache()
/** Transcript path per session as of the last list — what a search reads. */
const pathById = new Map<string, string | null>()
const searches = new Map<string, AbortController>()

function getLedger(): SessionLedger {
  if (!ledger) ledger = new SessionLedger(path.join(app.getPath('userData'), 'session-history'))
  return ledger
}

function getCapture(): CaptureStore {
  if (!capture) capture = new CaptureStore(path.join(app.getPath('userData'), 'exchange-capture'))
  return capture
}

export function transcriptsRoot(): string {
  return process.env.CLAVE_TRANSCRIPTS_ROOT || path.join(homedir(), '.claude', 'projects')
}

/** Validate, then append. The one place a row enters the ledger. */
export function stampHistory(input: unknown): void {
  const row = normalizeLedgerRow(input)
  if (!row) {
    console.error('[session-history] refusing to write a malformed ledger row')
    return
  }
  try {
    getLedger().append(row)
  } catch (err) {
    console.error('[session-history] failed to append to the ledger', err)
  }
}

export function listHistory(options?: { all?: boolean }): {
  entries: HistoryListEntry[]
  skippedLines: number
} {
  const { rows, skippedLines } = getLedger().readAll()
  const seed = captureEventsToRows(getCapture().readAll().events as never[])
  const root = transcriptsRoot()
  const index = indexTranscripts(root)
  const entries = foldHistory([...seed, ...rows])
    // Nothing to resume without a Claude transcript: `claude agents` tabs
    // and the other CLIs never make a row.
    .filter((e) => e.mode === 'claude')
    .map((e): HistoryListEntry => {
      const file = locateTranscript(root, e.cwd, e.claudeSessionId, index)
      pathById.set(e.claudeSessionId, file)
      const transcript = peekCache.get(file)
      return {
        ...e,
        source: 'ledger' as const,
        transcript,
        title: transcript.title ?? e.name,
        lastHumanAt:
          transcript.lastHumanAt ?? e.lastSeenAt ?? transcript.modifiedAt ?? e.firstSeenAt
      }
    })
  if (options?.all) {
    const known = new Set(entries.map((e) => e.claudeSessionId))
    // One stem can live under TWO project dirs (`claude --resume` run from a
    // subdirectory writes a stub beside the real transcript): same
    // conversation, one row — the larger file wins, and it is also the one
    // the search reads.
    const synthAt = new Map<string, number>()
    for (const { dir, stem } of unknownStems(index, known)) {
      const file = path.join(root, dir, `${stem}.jsonl`)
      const transcript = peekCache.get(file)
      if (!transcript.exists) continue
      const existingAt = synthAt.get(stem)
      if (existingAt !== undefined) {
        if (entries[existingAt].transcript.sizeBytes >= transcript.sizeBytes) continue
        entries.splice(existingAt, 1)
        synthAt.delete(stem)
        for (const [k, v] of synthAt) if (v > existingAt) synthAt.set(k, v - 1)
      }
      pathById.set(stem, file)
      const firstSeenAt = transcript.firstAt ?? transcript.modifiedAt ?? ''
      const lastHumanAt = transcript.lastHumanAt ?? transcript.modifiedAt ?? firstSeenAt
      synthAt.set(stem, entries.length)
      entries.push({
        projectDir: dir,
        claudeSessionId: stem,
        sessionId: '',
        name: '',
        cwd: transcript.cwd ?? '',
        mode: 'claude',
        model: null,
        workspaceId: null,
        groups: [],
        firstSeenAt,
        lastSeenAt: lastHumanAt,
        closedAt: null,
        source: 'transcript',
        transcript,
        title: transcript.title ?? `Conversation ${stem.slice(0, 8)}`,
        lastHumanAt
      })
    }
  }
  return { entries, skippedLines }
}

export interface SearchRequest {
  requestId: string
  query: string
  scope: SearchScope
  /** The sessions in the dialog's current scope; unknown ids and sessions
   *  whose transcript is gone are skipped. */
  claudeSessionIds: string[]
}

export interface SearchProgress {
  requestId: string
  hits: SearchHit[]
}

export interface SearchDone {
  requestId: string
  filesSearched: number
  truncated: boolean
}

const SCOPES: ReadonlySet<string> = new Set<SearchScope>(['human', 'agent', 'tools'])

/** Run one scoped search over the named sessions' transcripts, streaming
 *  hits through `onHits`. A second request with the same id cancels the
 *  first. Resolves when the search ends, cancelled or not. */
export async function searchHistory(
  input: unknown,
  onHits: (progress: SearchProgress) => void
): Promise<SearchDone> {
  const r = input as Partial<SearchRequest> | null
  const requestId = typeof r?.requestId === 'string' ? r.requestId : ''
  const query = typeof r?.query === 'string' ? r.query : ''
  const scope = typeof r?.scope === 'string' && SCOPES.has(r.scope) ? r.scope : null
  const ids = Array.isArray(r?.claudeSessionIds)
    ? r.claudeSessionIds.filter((id): id is string => typeof id === 'string')
    : []
  if (!requestId || !scope) return { requestId, filesSearched: 0, truncated: false }
  cancelSearch(requestId)
  const ac = new AbortController()
  searches.set(requestId, ac)
  try {
    const files = ids
      .map((id) => ({ claudeSessionId: id, path: pathById.get(id) ?? null }))
      .filter((f): f is { claudeSessionId: string; path: string } => f.path !== null)
    const result = await searchTranscripts(files, {
      query,
      scope,
      signal: ac.signal,
      onHits: (hits) => {
        if (!ac.signal.aborted) onHits({ requestId, hits })
      }
    })
    return { requestId, filesSearched: result.filesSearched, truncated: result.truncated }
  } finally {
    if (searches.get(requestId) === ac) searches.delete(requestId)
  }
}

export function cancelSearch(requestId: string): void {
  const running = searches.get(requestId)
  if (!running) return
  running.abort()
  searches.delete(requestId)
}
