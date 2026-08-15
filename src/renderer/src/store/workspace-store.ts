import { create } from 'zustand'
import type { Workspace } from '../../../shared/workspace-types'

export type { Workspace }

/** Workspace registry — a LEAF store: plain state, no imports of the session
 *  or pinned stores (they import this one for stamping). All orchestration
 *  (activation side effects, add/remove cascades, persistence) lives in
 *  lib/workspace-actions.ts, which sits above every store.
 *
 *  Invariant: `activeWorkspaceId === null` ⟺ `workspaces.length === 0`.
 *  While workspaces exist, exactly one is always active — there is no
 *  "deactivated" state. With zero workspaces the app runs unscoped and
 *  behaves as if the workspace feature didn't exist.
 */
interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  /** True once boot hydration (workspace:load + pin import) has run. */
  loaded: boolean
}

export const useWorkspaceStore = create<WorkspaceState>(() => ({
  workspaces: [],
  activeWorkspaceId: null,
  loaded: false
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
