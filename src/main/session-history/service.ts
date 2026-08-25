import * as path from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import { CaptureStore } from '../exchange-capture/store'
import { SessionLedger, normalizeLedgerRow } from './ledger'
import { captureEventsToRows, foldHistory, type HistoryEntry } from './index'
import { locateTranscript, peekTranscript, type TranscriptPeek } from './transcript-peek'

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
 * so reopening the dialog re-reads only what changed.
 */

export interface HistoryListEntry extends HistoryEntry {
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
const peekCache = new Map<
  string,
  { size: number; modifiedAt: string | null; peek: TranscriptPeek }
>()

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

function cachedPeek(filePath: string | null): TranscriptPeek {
  if (!filePath) return peekTranscript(null)
  const fresh = peekTranscript(filePath)
  const hit = peekCache.get(filePath)
  // The first peek already read the tail; the cache only spares the wider
  // second read on an unchanged file, and keeps a stable object for React.
  if (hit && hit.size === fresh.sizeBytes && hit.modifiedAt === fresh.modifiedAt) return hit.peek
  peekCache.set(filePath, { size: fresh.sizeBytes, modifiedAt: fresh.modifiedAt, peek: fresh })
  return fresh
}

export function listHistory(): { entries: HistoryListEntry[]; skippedLines: number } {
  const { rows, skippedLines } = getLedger().readAll()
  const seed = captureEventsToRows(getCapture().readAll().events as never[])
  const root = transcriptsRoot()
  const entries = foldHistory([...seed, ...rows])
    // Nothing to resume without a Claude transcript: `claude agents` tabs
    // and the other CLIs never make a row.
    .filter((e) => e.mode === 'claude')
    .map((e): HistoryListEntry => {
      const transcript = cachedPeek(locateTranscript(root, e.cwd, e.claudeSessionId))
      return {
        ...e,
        transcript,
        title: transcript.title ?? e.name,
        lastHumanAt:
          transcript.lastHumanAt ?? e.lastSeenAt ?? transcript.modifiedAt ?? e.firstSeenAt
      }
    })
  return { entries, skippedLines }
}
