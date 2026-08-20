import type { CaptureEvent, ResolvedExchangeScope } from './types'

/**
 * Pure filtering for the exchanges view — no Electron, no filesystem, so the
 * scope/direction/since/limit semantics are probe-testable on plain data.
 */

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

/** Group membership of an event is its endpoints' CAPTURE-TIME groups — the
 *  record keeps what was true when the event happened. */
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

export interface EventFilterArgs {
  direction?: 'incoming' | 'outgoing'
  sinceMs?: number
  limit: number
}

export interface FilteredEvents {
  events: CaptureEvent[]
  totalMatched: number
  truncated: boolean
}

/** Filter and order events for a resolved scope: chronological by event `ts`
 *  (subagent spawns carry their true spawn time but are appended at
 *  discovery), newest `limit` kept, truncation reported loudly. */
export function filterEvents(
  all: CaptureEvent[],
  scope: ResolvedExchangeScope,
  args: EventFilterArgs
): FilteredEvents {
  const sessionIds = new Set(scope.sessions.map((s) => s.sessionId))
  const matched = all.filter((event) => {
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
    if (args.sinceMs !== undefined) {
      const ts = Date.parse(event.ts)
      if (!Number.isNaN(ts) && ts < args.sinceMs) return false
    }
    return true
  })
  matched.sort((a, b) => (Date.parse(a.ts) || 0) - (Date.parse(b.ts) || 0))
  const truncated = matched.length > args.limit
  return {
    events: truncated ? matched.slice(matched.length - args.limit) : matched,
    totalMatched: matched.length,
    truncated
  }
}
