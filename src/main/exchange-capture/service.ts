import * as path from 'path'
import { app } from 'electron'
import { validateWorkstreamEvent } from './contract/workstream-events'
import { CaptureStore } from './store'
import {
  computeSessionSnapshot,
  listSidecars,
  rootTranscriptPath,
  subagentsDir
} from './transcript'
import type {
  CaptureEvent,
  EndpointIdentity,
  MessageCapturePayload,
  MessageEvent,
  SessionStateCapturePayload,
  SessionStateEvent,
  TabClosedCapturePayload,
  TabClosedEvent,
  TabSpawnCapturePayload,
  TabSpawnEvent,
  UsageSnapshot
} from './types'

/**
 * Exchange-capture service: the main-process owner of the capture store.
 * Capture is observability — it must never fail or delay what it records, so
 * the renderer fires capture IPC without waiting and failures are logged
 * loudly here instead of propagating.
 *
 * Every line written is `v: 2` and is checked against the mirrored contract
 * validator before the append: a line that would not conform is logged with
 * its problems and NOT written (the record's readers type known kinds from
 * their bodies; one malformed body would be a reported problem on every read
 * of every workstream the line lands in). The conformance tests make that
 * branch unreachable for the shapes this file builds.
 */

let store: CaptureStore | null = null

function getStore(): CaptureStore {
  if (!store) store = new CaptureStore(path.join(app.getPath('userData'), 'exchange-capture'))
  return store
}

/** Validate, then append. The one place a line enters the store. */
function write(event: CaptureEvent): void {
  const verdict = validateWorkstreamEvent(event)
  if (!verdict.ok) {
    console.error(
      `[exchange-capture] refusing to write a non-conforming ${event.kind} event: ${verdict.problems.join('; ')}`
    )
    return
  }
  getStore().append(event)
}

function snapshotFor(endpoint: EndpointIdentity): {
  usage: UsageSnapshot | null
  error: string | null
} {
  if (!endpoint.claudeSessionId) {
    return {
      usage: null,
      error: `no token snapshot: "${endpoint.name}" is a ${endpoint.mode} session with no Claude Code transcript`
    }
  }
  try {
    return { usage: computeSessionSnapshot(endpoint.cwd, endpoint.claudeSessionId), error: null }
  } catch (err) {
    const file = rootTranscriptPath(endpoint.cwd, endpoint.claudeSessionId)
    const message = err instanceof Error ? err.message : String(err)
    return { usage: null, error: `transcript unreadable at ${file}: ${message}` }
  }
}

/** Record any not-yet-seen Task-subagent sidecars of an endpoint as
 *  subagent_spawn events. Called at every delivery involving the session —
 *  discovery is lazy by design (Clave does not observe Task spawns live),
 *  and durable from first sight. */
function discoverSubagents(endpoint: EndpointIdentity): void {
  if (!endpoint.claudeSessionId) return
  const captureStore = getStore()
  for (const sidecar of listSidecars(subagentsDir(endpoint.cwd, endpoint.claudeSessionId))) {
    if (captureStore.hasSubagent(endpoint.claudeSessionId, sidecar.agentId)) continue
    const now = new Date().toISOString()
    write({
      v: 2,
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
      v: 2,
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
    write(event)
  } catch (err) {
    console.error('[exchange-capture] failed to record message delivery', err)
  }
}

export function captureTabSpawn(payload: TabSpawnCapturePayload): void {
  try {
    const event: TabSpawnEvent = { v: 2, kind: 'tab_spawn', ...payload }
    write(event)
  } catch (err) {
    console.error('[exchange-capture] failed to record tab spawn', err)
  }
}

export function captureSessionState(payload: SessionStateCapturePayload): void {
  try {
    const event: SessionStateEvent = { v: 2, kind: 'session_state', ...payload }
    write(event)
  } catch (err) {
    console.error('[exchange-capture] failed to record session state', err)
  }
}

export function captureTabClosed(payload: TabClosedCapturePayload): void {
  try {
    const event: TabClosedEvent = { v: 2, kind: 'tab_closed', ...payload }
    write(event)
  } catch (err) {
    console.error('[exchange-capture] failed to record tab close', err)
  }
}
