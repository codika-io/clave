import * as path from 'path'
import { app } from 'electron'
import { CaptureStore } from './store'
import {
  computeTokenSnapshot,
  listSidecars,
  parseConversation,
  rootTranscriptPath,
  subagentsDir
} from './transcript'
import type {
  CaptureEvent,
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

/** Which sessions an event involves, for direction filtering: `out` sent or
 *  spawned; `in` received or was spawned. Subagents are not tabs, so a
 *  subagent_spawn only ever matches its parent session, outgoing. */
function eventSides(event: CaptureEvent): { out: string[]; in: string[] } {
  switch (event.kind) {
    case 'message':
      return { out: [event.sender.sessionId], in: [event.target.sessionId] }
    case 'tab_spawn':
      return { out: [event.spawner.sessionId], in: [event.session.sessionId] }
    case 'subagent_spawn':
      return { out: [event.session.sessionId], in: [] }
  }
}

function eventGroupIds(event: CaptureEvent): (string | null)[] {
  switch (event.kind) {
    case 'message':
      return [event.sender.groupId, event.target.groupId]
    case 'tab_spawn':
      return [event.spawner.groupId, event.session.groupId]
    case 'subagent_spawn':
      return [event.session.groupId]
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
  const sessionIds = new Set(scope.sessions.map((s) => s.sessionId))
  const matched = events.filter((event) => {
    if (scope.scope === 'group') {
      if (!eventGroupIds(event).includes(scope.group!.id)) return false
    } else {
      const sides = eventSides(event)
      const involved =
        args.direction === 'outgoing'
          ? sides.out
          : args.direction === 'incoming'
            ? sides.in
            : [...sides.out, ...sides.in]
      if (!involved.some((id) => sessionIds.has(id))) return false
    }
    if (sinceMs !== undefined) {
      const ts = Date.parse(event.ts)
      if (!Number.isNaN(ts) && ts < sinceMs) return false
    }
    return true
  })
  // Append order is delivery order; subagent_spawn events carry their true
  // spawn time but are appended at discovery — sort by ts so the timeline
  // reads chronologically (stable sort keeps append order on ties).
  matched.sort((a, b) => (Date.parse(a.ts) || 0) - (Date.parse(b.ts) || 0))
  const truncated = matched.length > args.limit
  return {
    view: 'exchanges',
    scope: scopeSummary(scope),
    events: truncated ? matched.slice(matched.length - args.limit) : matched,
    totalMatched: matched.length,
    truncated,
    storeSkippedLines: skippedLines
  }
}
