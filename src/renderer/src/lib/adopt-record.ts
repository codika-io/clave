import type { SessionRecord } from '../../../preload/index.d'
import { useSessionStore } from '../store/session-store'

/**
 * Bring one persisted session record back as a live tab in THIS window's
 * store (PRDCT-1703). Shared by two callers:
 *  - boot restore (AppShell): this window's survivors of a previous run;
 *  - re-homing: a session detached from another window that this window
 *    now holds — a closing window's sessions handed to the primary, or a tab
 *    (or a whole group) moved here.
 *
 * Live tmux survivors reattach to the running process (scrollback intact via
 * the tmux repaint); dead records relaunch fresh in the same cwd (Claude
 * resuming via claudeSessionId). The original session id is preserved
 * (`adoptSessionId`) so MCP addressing, lifecycle-hook status and exchange
 * capture keep working across the move exactly as across an app restart.
 * Returns the new session id, or null on failure.
 */
export async function adoptRecord(
  s: SessionRecord,
  activeWorkspaceId: string | null
): Promise<string | null> {
  try {
    const workspaceId = s.workspaceId ?? activeWorkspaceId ?? undefined
    const info = await window.electronAPI.spawnSession(s.cwd, {
      claudeMode: s.claudeMode,
      antigravityMode: s.antigravityMode,
      codexMode: s.codexMode,
      claudeAgentsMode: s.claudeAgentsMode,
      dangerousMode: s.dangerousMode,
      model: s.model,
      // Live survivor: MUST go through tmux to reattach. Dead record: fresh
      // spawn under the current global tmux preference — the name is still
      // offered so a tmux respawn reuses it.
      ...(s.live && s.tmuxName
        ? { tmuxMode: true, adoptTmuxName: s.tmuxName }
        : s.tmuxName
          ? { adoptTmuxName: s.tmuxName }
          : {}),
      // Reuse the original id so lifecycle-hook status routing keeps working.
      adoptSessionId: s.id,
      // Live survivor: reattach (claudeSessionId only drives the badge). Dead
      // record: re-spawn with --resume to reload the prior conversation.
      ...(s.live
        ? { claudeSessionId: s.claudeSessionId }
        : s.claudeMode && s.claudeSessionId
          ? { resumeSessionId: s.claudeSessionId }
          : {}),
      configDir: s.configDir,
      claudeProfileId: s.claudeProfileId,
      claudeProfileLabel: s.claudeProfileLabel,
      workspaceId
    })
    useSessionStore.getState().addSession({
      id: info.id,
      cwd: info.cwd,
      folderName: info.folderName,
      name: s.displayName || s.folderName,
      userRenamed: s.userRenamed === true,
      alive: info.alive,
      activityStatus: 'idle',
      promptWaiting: null,
      claudeMode: s.claudeMode,
      antigravityMode: s.antigravityMode,
      codexMode: s.codexMode,
      claudeAgentsMode: s.claudeAgentsMode,
      dangerousMode: s.dangerousMode,
      model: s.model,
      claudeSessionId: info.claudeSessionId,
      claudeProfileId: s.claudeProfileId,
      claudeProfileLabel: s.claudeProfileLabel,
      claudeConfigDir: s.configDir,
      sessionType: 'local',
      workspaceId,
      view: s.view ? { ...s.view } : undefined
    })
    return info.id
  } catch (err) {
    console.error('Failed to adopt session record:', s.tmuxName ?? s.id, err)
    return null
  }
}

/**
 * Adopt records for the given session ids — the re-home path. Fetches those
 * records whatever window they were stamped with (main just detached them
 * from their old window; they are adoptable-live), adopts each into this
 * window (the adoption re-stamps the record to this window), skipping any
 * already in this store, then acknowledges to main so a caller waiting to
 * act on the moved tab here (an MCP move into a group) can proceed.
 */
export async function adoptRehomed(ids: string[], activeWorkspaceId: string | null): Promise<void> {
  if (ids.length === 0) return
  const already = new Set(useSessionStore.getState().sessions.map((s) => s.id))
  const records =
    (await window.electronAPI?.listSessionRecords?.({ ids }).catch(() => [])) ?? []
  for (const r of records) {
    if (!already.has(r.id)) await adoptRecord(r, activeWorkspaceId)
  }
  window.electronAPI?.ackRehomed?.(ids)
}
