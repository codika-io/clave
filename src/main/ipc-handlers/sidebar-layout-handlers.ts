import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import {
  sidebarLayoutManager,
  isValidLayoutKey,
  type LayoutKey,
  type SidebarLayout
} from '../sidebar-layout-manager'
import { windowRegistry } from '../window-registry'
import { workspaceManager } from '../workspace-manager'
import { sessionRecordsDir } from '../pty-manager'

/** Session id → workspace, read straight from the session records on disk:
 *  the migration places a bare session id in `displayOrder` by the workspace
 *  its record carries (stamped at spawn), else by its cwd against the
 *  registered roots. Records are small JSON files; a malformed one is skipped. */
function sessionWorkspaceResolver(): (sessionId: string) => string | null {
  const byId = new Map<string, string | null>()
  try {
    const dir = sessionRecordsDir()
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as {
          id?: unknown
          workspaceId?: unknown
          cwd?: unknown
        }
        if (typeof meta.id !== 'string') continue
        byId.set(
          meta.id,
          typeof meta.workspaceId === 'string'
            ? meta.workspaceId
            : typeof meta.cwd === 'string'
              ? workspaceManager.resolveWorkspaceForCwd(meta.cwd)
              : null
        )
      } catch {
        /* skip malformed record */
      }
    }
  } catch {
    /* no records dir yet */
  }
  return (id) => byId.get(id) ?? null
}

/** The one-time legacy migration, attempted before every load: it is a no-op
 *  the moment the legacy file is gone, and it needs the registry to exist —
 *  the first load with a registered workspace is exactly "first post-update
 *  load" for the file that matters. */
function migrateLegacyIfNeeded(): void {
  const workspaceIds = workspaceManager.getWorkspaces().map((w) => w.id)
  if (workspaceIds.length === 0) return
  const fallback = workspaceManager.resolveInitialWorkspaceId() ?? workspaceIds[0]
  try {
    sidebarLayoutManager.migrateLegacy({
      workspaceIds,
      fallbackWorkspaceId: fallback,
      resolveWorkspaceForCwd: (cwd) => workspaceManager.resolveWorkspaceForCwd(cwd),
      resolveWorkspaceForSession: sessionWorkspaceResolver()
    })
  } catch (err) {
    console.error('[sidebar-layout] legacy migration failed:', err)
  }
}

function normalizeKeys(keys: unknown): LayoutKey[] {
  if (!Array.isArray(keys)) return [null]
  const out: LayoutKey[] = []
  for (const k of keys) {
    if (k === null || isValidLayoutKey(k)) out.push(k)
  }
  return out
}

export function registerSidebarLayoutHandlers(): void {
  // Load the layouts of the workspaces this window hosts, concatenated. The
  // null key is the unscoped (no-workspace mode) layout.
  ipcMain.handle('sidebar-layout:load', (_event, keys: unknown) => {
    migrateLegacyIfNeeded()
    return sidebarLayoutManager.load(normalizeKeys(keys))
  })

  // Write ownership, enforced here (the hosting rule): a window may write a
  // workspace's layout iff it SHOWS that workspace, or it is the primary and
  // no window shows it. A refused write is loud and writes nothing — two
  // windows silently overwriting one file is the defect this replaces.
  ipcMain.handle('sidebar-layout:save', (event, key: unknown, data: SidebarLayout) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    const layoutKey: LayoutKey | undefined =
      key === null ? null : isValidLayoutKey(key) ? key : undefined
    if (layoutKey === undefined) {
      console.error(`[sidebar-layout] refused: invalid layout key ${JSON.stringify(key)}`)
      return { ok: false as const, reason: 'invalid-key' as const }
    }
    if (!sender || !windowRegistry.canWriteWorkspace(sender.id, layoutKey)) {
      const host = layoutKey
        ? windowRegistry.getHostWindowForWorkspace(layoutKey)
        : windowRegistry.getPrimaryWindow()
      console.error(
        `[sidebar-layout] refused: window ${sender?.id ?? '?'} may not write workspace ${layoutKey ?? '(unscoped)'} — it is hosted by window ${host?.id ?? '?'}`
      )
      return { ok: false as const, reason: 'not-host' as const, hostWindowId: host?.id ?? null }
    }
    sidebarLayoutManager.save(layoutKey, data)
    return { ok: true as const }
  })
}
