/** Workspace model shared between main and renderer.
 *
 * A workspace is a ROOT FOLDER (e.g. ~/.antasphere), not a .clave file: each
 * workspace carries one chosen profile file (.clave/workspaces/<name>.clave)
 * that defines its pinned groups and toolbar. Exactly one workspace is active
 * at a time and scopes everything visible (sessions, groups, pins, toolbar);
 * `activeWorkspaceId === null` if and only if no workspaces are registered
 * (the app then behaves as if the feature didn't exist).
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
 *  same way sidebar-layout.json stores groups — main is dumb, crash-safe
 *  storage; the renderer is the source of truth during a run. */
export interface WorkspaceStateFile {
  version: 1
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  pins: unknown[]
  /** False right after the main-side registry migration (Phase A); the
   *  renderer imports localStorage pins (Phase B) and flips it true. */
  pinsMigrated: boolean
}
