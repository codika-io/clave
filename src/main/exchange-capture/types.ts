/**
 * Exchange-capture event schema — the transport-layer record of what Clave
 * already sees: inter-session message deliveries, agent-initiated tab spawns,
 * and Task-subagent fan-outs discovered from session transcripts.
 *
 * This is the ONE line schema shared by every consumer: the on-disk capture
 * store (`<userData>/exchange-capture/events.jsonl`), the clave_read_exchanges
 * MCP tool's `exchanges` view, and the exos-side `telemetry.jsonl` workstream
 * sidecar (a filtered copy of these lines, landed by the workstream's single
 * writer — Clave itself never writes there). One JSON object per line; the
 * `v`/`kind`/`ts` envelope is what downstream lint validates, so those three
 * fields are required on every line and new event kinds are additive.
 */

/** Identity of one endpoint of an event, stamped AT CAPTURE TIME — events keep
 *  the names and group membership that were true when they happened, and
 *  survive session or group deletion unchanged. */
export interface EndpointIdentity {
  /** Clave tab id (the session id used by the clave_* tools). */
  sessionId: string
  name: string
  mode: 'claude' | 'antigravity' | 'codex' | 'claude-agents' | 'terminal'
  cwd: string
  /** Host Claude Code session id (`--session-id`); null for non-claude tabs.
   *  This is what links the endpoint to its transcript on disk. */
  claudeSessionId: string | null
  groupId: string | null
  groupName: string | null
}

/** Cumulative BILLED token counters: the sum over every per-call `usage` block
 *  in a transcript. Each API call re-reads the context (mostly as cache
 *  reads), so these sums grow with every call — they measure spend, not size. */
export interface BilledCounters {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  /** Sum of the four counters above. */
  totalTokens: number
  /** Number of usage-bearing API calls summed. */
  apiCalls: number
}

/**
 * A session's token usage computed from its transcript files.
 *
 * Two DISTINCT numbers, never conflated:
 * - `billed` — cumulative spend across the whole transcript, root session AND
 *   all of its Task-subagent sidecar transcripts (subagent burn is real burn);
 *   the `subagents` sub-object breaks out the sidecar share already included
 *   in the top-level counters.
 * - `contextOccupancy` — how full the ROOT session's context window is right
 *   now: input + cache-read + cache-creation tokens of the latest completed
 *   API call (what entered that request). Sidecars never count here — they
 *   have their own windows.
 *
 * Staleness: computed from the transcript as it exists on disk at
 * `computedAt`; a still-streaming turn shows the last COMPLETED call.
 */
export interface TokenSnapshot {
  computedAt: string
  billed: BilledCounters & { subagents: BilledCounters & { count: number } }
  contextOccupancy: {
    tokens: number
    /** Timestamp of the transcript entry the occupancy was read from; null
     *  when the transcript has no usage-bearing entry yet (tokens is 0). */
    asOf: string | null
  }
}

/** A clave_send_to_session delivery. `text` is the message as delivered
 *  (control bytes stripped by the paste guard), excluding the provenance
 *  header, which is carried separately in `provenance`. */
export interface MessageEvent {
  v: 1
  kind: 'message'
  /** Delivery time, ISO-8601 UTC. */
  ts: string
  sender: EndpointIdentity
  target: EndpointIdentity
  text: string
  provenance: string
  /** False when the target exited during delivery (the send was a no-op). */
  delivered: boolean
  /** Token snapshots of both endpoints at delivery; null with the reason in
   *  the matching *UsageError when a snapshot cannot be computed (non-claude
   *  endpoint, transcript not on disk yet, unreadable transcript). */
  senderUsage: TokenSnapshot | null
  senderUsageError: string | null
  targetUsage: TokenSnapshot | null
  targetUsageError: string | null
}

/** A sibling tab opened by an agent via clave_open_session (agent delegation).
 *  UI-originated opens are not transport events and are not captured. */
export interface TabSpawnEvent {
  v: 1
  kind: 'tab_spawn'
  ts: string
  spawner: EndpointIdentity
  /** The newly opened tab. */
  session: EndpointIdentity
  /** The initial prompt the tab was opened with; null when none was given. */
  prompt: string | null
  model: string | null
}

/** A Task-subagent fan-out, discovered from a session's sidecar transcripts
 *  (`<transcript dir>/<claudeSessionId>/subagents/agent-<id>.jsonl`).
 *  Discovery is lazy by design: sidecars are scanned whenever the parent
 *  session's usage is computed (each message delivery) and whenever a query
 *  touches the session — from that moment the spawn is recorded durably. */
export interface SubagentSpawnEvent {
  v: 1
  kind: 'subagent_spawn'
  /** Spawn time: the sidecar's first-line timestamp (falls back to
   *  discoveredAt when the sidecar carries none). */
  ts: string
  discoveredAt: string
  /** The parent (root) session the subagent belongs to. */
  session: EndpointIdentity
  agentId: string
  /** The subagent's launch prompt: the sidecar's first user message. */
  prompt: string | null
  transcriptPath: string
}

export type CaptureEvent = MessageEvent | TabSpawnEvent | SubagentSpawnEvent

/** What the renderer sends over IPC after a delivery — everything except the
 *  usage snapshots, which the main process computes from disk. */
export type MessageCapturePayload = Omit<
  MessageEvent,
  'v' | 'kind' | 'senderUsage' | 'senderUsageError' | 'targetUsage' | 'targetUsageError'
>

export type TabSpawnCapturePayload = Omit<TabSpawnEvent, 'v' | 'kind'>

/** Scope resolved by the renderer (which owns identities and the reach gate)
 *  for a clave_read_exchanges query. */
export interface ResolvedExchangeScope {
  scope: 'group' | 'session'
  group: { id: string; name: string } | null
  sessions: EndpointIdentity[]
}

export interface ExchangeQueryArgs {
  view: 'exchanges' | 'usage' | 'conversation'
  direction?: 'incoming' | 'outgoing'
  since?: string
  limit: number
}

/** One human- or agent-authored message of the human-layer conversation view.
 *  Agent entries carry `position`: 'end-of-turn' for the turn's final say
 *  (no tool use follows it before the next human message), 'mid-turn' for
 *  progress notes emitted between operations. The last turn of a live
 *  transcript is tagged on what is visible so far. */
export interface ConversationEntry {
  role: 'human' | 'agent'
  ts: string | null
  text: string
  position?: 'mid-turn' | 'end-of-turn'
}
