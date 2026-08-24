/** Workspace model shared between main and renderer.
 *
 * A workspace is a ROOT FOLDER (e.g. ~/.antasphere), not a .clave file: each
 * workspace carries one chosen profile file (.clave/workspaces/<name>.clave)
 * that defines its pinned groups and toolbar. Each WINDOW shows exactly one
 * workspace and scopes everything visible in it (sessions, groups, pins,
 * toolbar); a window's `activeWorkspaceId === null` if and only if no
 * workspaces are registered (the app then behaves as if the feature didn't
 * exist). At most one window shows a given workspace at a time.
 */
export interface Workspace {
  /** Stable uuid — sessions, groups, and pins are stamped with it. */
  id: string
  /** Display name; defaults to the cleaned basename of rootDir ("Antasphere"). */
  name: string
  /** Absolute, realpath-normalized root folder. Unique across the registry;
   *  nested roots are rejected at registration. */
  rootDir: string
  /** Absolute path to the chosen profile .clave file, or null for a bare
   *  workspace with no pins (sessions still scope to it). */
  profileFile: string | null
  createdAt: number
}

/** Everything persisted in <userData>/workspace-state.json. The main process
 *  stores `pins` opaquely (the renderer's pinned-store owns their shape), the
 *  same way the sidebar layouts store groups — main is dumb, crash-safe
 *  storage; the renderer is the source of truth during a run. */
/** What a renderer learns about the window it runs in — and only that
 *  window. Runtime truth from the main-process WindowRegistry, never
 *  persisted (BrowserWindow ids restart at 1 on every launch). */
export interface WindowIdentity {
  windowId: number
  /** The workspace this window SHOWS; null only in no-workspace mode. */
  workspaceId: string | null
  /** The first window of the run, re-elected as the lowest surviving id when
   *  it closes: hosts every workspace no window shows, carries app-level
   *  fallbacks, and alone writes the unscoped (no-workspace) state. */
  isPrimary: boolean
  /** Workspaces whose sessions and state writes this window owns: its own,
   *  plus — for the primary — every registered workspace no window shows. */
  hostedWorkspaceIds: string[]
}

export interface WorkspaceStateFile {
  version: 1
  workspaces: Workspace[]
  /** What the FIRST window of a run opens on; updated whenever any window
   *  switches to or opens a workspace. Informational only while running — a
   *  window's own workspace lives in the WindowRegistry, never here. */
  lastActiveWorkspaceId: string | null
  /** Legacy mirror of `lastActiveWorkspaceId`, read by releases before the
   *  multi-window build. Written for one release so a downgrade keeps its
   *  active workspace; read only when the new key is absent. */
  activeWorkspaceId: string | null
  pins: unknown[]
  /** False right after the main-side registry migration (Phase A); the
   *  renderer imports localStorage pins (Phase B) and flips it true. */
  pinsMigrated: boolean
}
