import * as path from 'path'
import { app } from 'electron'
import { filterEvents } from './query'
import { CaptureStore } from './store'
import {
  computeTokenSnapshot,
  listSidecars,
  parseConversation,
  rootTranscriptPath,
  subagentsDir
} from './transcript'
import type {
  EndpointIdentity,
  ExchangeQueryArgs,
  MessageCapturePayload,
  MessageEvent,
  ResolvedExchangeScope,
  TabSpawnCapturePayload,
  TokenSnapshot
} from './types'

/**
 * Exchange-capture service: the main-process owner of the capture store and
 * the query engine behind clave_read_exchanges. Capture is observability —
 * it must never fail or delay a delivery, so the renderer fires capture IPC
 * without waiting and failures are logged loudly here instead of propagating.
 */

let store: CaptureStore | null = null

function getStore(): CaptureStore {
  if (!store) store = new CaptureStore(path.join(app.getPath('userData'), 'exchange-capture'))
  return store
}

function snapshotFor(endpoint: EndpointIdentity): {
  usage: TokenSnapshot | null
  error: string | null
} {
  if (!endpoint.claudeSessionId) {
    return {
      usage: null,
      error: `no token snapshot: "${endpoint.name}" is a ${endpoint.mode} session with no Claude Code transcript`
    }
  }
  try {
    return { usage: computeTokenSnapshot(endpoint.cwd, endpoint.claudeSessionId), error: null }
  } catch (err) {
    const file = rootTranscriptPath(endpoint.cwd, endpoint.claudeSessionId)
    const message = err instanceof Error ? err.message : String(err)
    return { usage: null, error: `transcript unreadable at ${file}: ${message}` }
  }
}

/** Record any not-yet-seen Task-subagent sidecars of an endpoint as
 *  subagent_spawn events. Called at every delivery involving the session and
 *  at every query touching it — discovery is lazy by design (Clave does not
 *  observe Task spawns live), and durable from first sight. */
function discoverSubagents(endpoint: EndpointIdentity): void {
  if (!endpoint.claudeSessionId) return
  const captureStore = getStore()
  for (const sidecar of listSidecars(subagentsDir(endpoint.cwd, endpoint.claudeSessionId))) {
    if (captureStore.hasSubagent(endpoint.claudeSessionId, sidecar.agentId)) continue
    const now = new Date().toISOString()
    captureStore.append({
      v: 1,
      kind: 'subagent_spawn',
      ts: sidecar.spawnedAt ?? now,
      discoveredAt: now,
      session: endpoint,
      agentId: sidecar.agentId,
      prompt: sidecar.prompt,
      transcriptPath: sidecar.transcriptPath
    })
  }
}

export function captureMessage(payload: MessageCapturePayload): void {
  try {
    discoverSubagents(payload.sender)
    discoverSubagents(payload.target)
    const sender = snapshotFor(payload.sender)
    const target = snapshotFor(payload.target)
    const event: MessageEvent = {
      v: 1,
      kind: 'message',
      ts: payload.ts,
      sender: payload.sender,
      target: payload.target,
      text: payload.text,
      provenance: payload.provenance,
      delivered: payload.delivered,
      senderUsage: sender.usage,
      senderUsageError: sender.error,
      targetUsage: target.usage,
      targetUsageError: target.error
    }
    getStore().append(event)
  } catch (err) {
    console.error('[exchange-capture] failed to record message delivery', err)
  }
}

export function captureTabSpawn(payload: TabSpawnCapturePayload): void {
  try {
    getStore().append({ v: 1, kind: 'tab_spawn', ...payload })
  } catch (err) {
    console.error('[exchange-capture] failed to record tab spawn', err)
  }
}

function scopeSummary(scope: ResolvedExchangeScope): unknown {
  return {
    kind: scope.scope,
    group: scope.group,
    sessions: scope.sessions.map((s) => ({
      sessionId: s.sessionId,
      name: s.name,
      mode: s.mode,
      claudeSessionId: s.claudeSessionId
    }))
  }
}

/**
 * Run a clave_read_exchanges query over an already-resolved (and reach-gated)
 * scope. Filters behave exactly as documented in the tool schema: `direction`
 * is session-scope only; `since` applies to the exchanges and conversation
 * views and errors on the usage view (a snapshot has no time range); `limit`
 * keeps the newest N of the exchanges view and of each session's conversation,
 * with truncation reported loudly.
 */
export function queryExchanges(scope: ResolvedExchangeScope, args: ExchangeQueryArgs): unknown {
  if (args.direction && scope.scope !== 'session') {
    throw new Error('direction applies to session-scoped queries only — omit it for group scope')
  }
  let sinceMs: number | undefined
  if (args.since !== undefined) {
    if (args.view === 'usage') {
      throw new Error('since does not apply to the usage view — a snapshot has no time range')
    }
    sinceMs = Date.parse(args.since)
    if (Number.isNaN(sinceMs)) {
      throw new Error(`since is not a parseable timestamp: "${args.since}" (use ISO 8601)`)
    }
  }
  // Surface any new Task-subagent fan-outs of the sessions being queried
  // before answering — this is the lazy-discovery floor: from the first query
  // touching a session, its subagent spawns are recorded durably.
  for (const session of scope.sessions) discoverSubagents(session)

  if (args.view === 'usage') {
    return {
      view: 'usage',
      scope: scopeSummary(scope),
      sessions: scope.sessions.map((session) => {
        const { usage, error } = snapshotFor(session)
        return { session, tokenUsage: usage, tokenUsageError: error }
      })
    }
  }

  if (args.view === 'conversation') {
    return {
      view: 'conversation',
      scope: scopeSummary(scope),
      sessions: scope.sessions.map((session) => {
        if (!session.claudeSessionId) {
          return {
            session,
            entries: null,
            error: `no conversation view: "${session.name}" is a ${session.mode} session with no Claude Code transcript`
          }
        }
        const file = rootTranscriptPath(session.cwd, session.claudeSessionId)
        try {
          const { entries, skippedLines } = parseConversation(file, sinceMs)
          const truncated = entries.length > args.limit
          return {
            session,
            entries: truncated ? entries.slice(entries.length - args.limit) : entries,
            totalEntries: entries.length,
            truncated,
            skippedLines,
            error: null
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return { session, entries: null, error: `transcript unreadable at ${file}: ${message}` }
        }
      })
    }
  }

  const { events, skippedLines } = getStore().readAll()
  const filtered = filterEvents(events, scope, {
    direction: args.direction,
    sinceMs,
    limit: args.limit
  })
  return {
    view: 'exchanges',
    scope: scopeSummary(scope),
    events: filtered.events,
    totalMatched: filtered.totalMatched,
    truncated: filtered.truncated,
    storeSkippedLines: skippedLines
  }
}
