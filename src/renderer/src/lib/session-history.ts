import { useSessionStore, inActiveWorkspace } from '../store/session-store'
import { getActiveWorkspaceId } from '../store/workspace-store'
import { SessionHistoryDiff, resumeTargetGroup } from './session-history-diff'
import type { HistoryListEntry, HistoryLedgerRow } from '../../../preload/index.d'

/**
 * The store glue of the session history (PRDCT-1738): the ledger's writer
 * (a diff over the store, see session-history-diff.ts) and the resume action
 * the dialog's rows perform. Fire-and-forget on the write side, like the
 * exchange capture: a ledger failure never reaches a store update.
 */

let diff: SessionHistoryDiff | null = null
let unsubscribe: (() => void) | null = null

function send(row: HistoryLedgerRow): void {
  try {
    window.electronAPI?.historyStamp?.(row)
  } catch {
    // observability, never a reason to break the store
  }
}

/** Start the diff. Called once the boot adoption has rebuilt the groups, so
 *  the first pass stamps the restored tabs where they actually sit rather
 *  than mid-restore. Idempotent. */
export function startSessionHistoryStamping(): void {
  if (unsubscribe) return
  diff = new SessionHistoryDiff(send)
  diff.apply(useSessionStore.getState())
  unsubscribe = useSessionStore.subscribe((state, prev) => {
    if (
      state.sessions === prev.sessions &&
      state.groups === prev.groups &&
      state.displayOrder === prev.displayOrder
    )
      return
    diff?.apply(state)
  })
}

/**
 * Resume a history entry: focus the live tab when the conversation is still
 * open, else spawn `claude --resume <id>` in the entry's own cwd (the
 * transcript lives under that cwd's project dir) and place the tab in ONE
 * step (`addSessionInGroup`) where `resumeTargetGroup` says. Same spawn the
 * sidebar's own Resume uses; returns the tab id, or null when nothing could
 * be opened.
 */
export async function resumeHistoryEntry(
  entry: HistoryListEntry,
  options: { groupId: string | null; dangerousMode: boolean }
): Promise<string | null> {
  const state = useSessionStore.getState()
  const live = state.sessions.find((s) => s.alive && s.claudeSessionId === entry.claudeSessionId)
  if (live) {
    state.selectSession(live.id, false)
    state.setFocusedSession(live.id)
    return live.id
  }
  if (!entry.transcript.exists) return null
  const workspaceId = entry.workspaceId ?? getActiveWorkspaceId() ?? undefined
  try {
    const info = await window.electronAPI.spawnSession(entry.cwd, {
      claudeMode: true,
      dangerousMode: options.dangerousMode,
      model: entry.model ?? undefined,
      resumeSessionId: entry.claudeSessionId,
      workspaceId
    })
    const after = useSessionStore.getState()
    const shown = after.groups.filter((g) => inActiveWorkspace(g, getActiveWorkspaceId()))
    const target = resumeTargetGroup(entry.groups, options.groupId, shown)
    after.addSessionInGroup(
      {
        id: info.id,
        cwd: info.cwd,
        folderName: info.folderName,
        name: entry.title,
        alive: info.alive,
        activityStatus: 'idle',
        promptWaiting: null,
        claudeMode: true,
        antigravityMode: false,
        codexMode: false,
        dangerousMode: options.dangerousMode,
        model: entry.model ?? undefined,
        workspaceId,
        claudeSessionId: info.claudeSessionId,
        sessionType: 'local'
      },
      target
    )
    // Select through the store's own path too: it clears an active group or
    // session VIEW (a project's board covering the pane), which the one-step
    // add deliberately does not touch — without this the conversation is
    // spawned, placed and selected under the board, and the click looks
    // like nothing happened.
    useSessionStore.getState().selectSession(info.id, false)
    return info.id
  } catch (err) {
    console.error('Failed to resume session from history:', err)
    return null
  }
}
