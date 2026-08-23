import { create } from 'zustand'
import type { Workspace } from '../../../shared/workspace-types'

export type { Workspace }

/** Workspace registry — a LEAF store: plain state, no imports of the session
 *  or pinned stores (they import this one for stamping). All orchestration
 *  (activation side effects, add/remove cascades, persistence) lives in
 *  lib/workspace-actions.ts, which sits above every store.
 *
 *  Multi-window (PRDCT-1703): `activeWorkspaceId` is the workspace THIS
 *  WINDOW shows — a per-window value handed to the renderer by main at boot,
 *  never read from the state file. The identity fields beside it say which
 *  window this is, whether it is the primary, and which workspaces it hosts
 *  (may write layout and pins for): its own, plus — for the primary — every
 *  registered workspace no window shows.
 *
 *  Invariant: `activeWorkspaceId === null` ⟺ `workspaces.length === 0`.
 *  While workspaces exist, exactly one is always active in a window — there
 *  is no "deactivated" state. With zero workspaces the app runs unscoped and
 *  behaves as if the workspace feature didn't exist.
 */
interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  /** True once boot hydration (workspace:load + pin import) has run. */
  loaded: boolean
  /** This window's BrowserWindow id; null until identity arrives (or outside
   *  Electron, where the renderer behaves as the sole, primary window). */
  windowId: number | null
  isPrimary: boolean
  hostedWorkspaceIds: string[]
}

export const useWorkspaceStore = create<WorkspaceState>(() => ({
  workspaces: [],
  activeWorkspaceId: null,
  loaded: false,
  windowId: null,
  isPrimary: true,
  hostedWorkspaceIds: []
}))

/** The active workspace's id, for stamping newly created sessions/groups/pins.
 *  Null in no-workspace mode (nothing gets stamped). */
export function getActiveWorkspaceId(): string | null {
  return useWorkspaceStore.getState().activeWorkspaceId
}

export function getWorkspaceById(id: string | null | undefined): Workspace | undefined {
  if (!id) return undefined
  return useWorkspaceStore.getState().workspaces.find((w) => w.id === id)
}

/** Does this window host `workspaceId` — may it write that workspace's
 *  layout and pins? The null (unscoped) partition belongs to the primary. */
export function hostsWorkspace(workspaceId: string | null | undefined): boolean {
  const s = useWorkspaceStore.getState()
  if (workspaceId == null) return s.isPrimary
  return s.hostedWorkspaceIds.includes(workspaceId)
}
