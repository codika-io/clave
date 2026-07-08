import { create } from 'zustand'
import { usePinnedStore } from './pinned-store'
import { importClaveFile } from './pinned-store'

export interface ClaveWorkspace {
  id: string
  name: string
  claveFilePath: string // Absolute path to the .clave file itself
  rootDir?: string | null // Root dir for resolving relative paths (null = file's parent dir)
}

interface WorkspaceState {
  workspaces: ClaveWorkspace[]
  activeWorkspaceId: string | null
  loaded: boolean
  addWorkspace: (folderPath: string) => Promise<boolean>
  addWorkspaceFiles: (files: { name: string; path: string }[]) => Promise<boolean>
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string | null) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  loaded: false,

  addWorkspace: async (folderPath: string) => {
    const claveFilePath = `${folderPath}/workspace.clave`
    const exists = await window.electronAPI?.claveFileExists(claveFilePath)
    if (!exists) return false

    // Check if already registered
    if (get().workspaces.some((w) => w.claveFilePath === claveFilePath)) return false

    const name = folderPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folderPath
    const workspace: ClaveWorkspace = {
      id: crypto.randomUUID(),
      name,
      claveFilePath
    }

    set((s) => {
      const next = [...s.workspaces, workspace]
      persistWorkspaces(next, s.activeWorkspaceId)
      return { workspaces: next }
    })

    return true
  },

  addWorkspaceFiles: async (files: { name: string; path: string; rootDir?: string | null }[]) => {
    const existing = get().workspaces
    const newWorkspaces: ClaveWorkspace[] = []

    for (const file of files) {
      if (existing.some((w) => w.claveFilePath === file.path)) continue
      if (newWorkspaces.some((w) => w.claveFilePath === file.path)) continue
      newWorkspaces.push({
        id: crypto.randomUUID(),
        name: file.name.charAt(0).toUpperCase() + file.name.slice(1),
        claveFilePath: file.path,
        rootDir: file.rootDir ?? null
      })
    }

    if (newWorkspaces.length === 0) return false

    set((s) => {
      const next = [...s.workspaces, ...newWorkspaces]
      persistWorkspaces(next, s.activeWorkspaceId)
      return { workspaces: next }
    })
    return true
  },

  removeWorkspace: (id: string) => {
    set((s) => {
      const next = s.workspaces.filter((w) => w.id !== id)
      const newActiveId = s.activeWorkspaceId === id ? null : s.activeWorkspaceId

      // If removing the active workspace, unload its pins
      if (s.activeWorkspaceId === id) {
        const workspace = s.workspaces.find((w) => w.id === id)
        if (workspace) {
          removeWorkspacePins(workspace.claveFilePath)
        }
      }

      persistWorkspaces(next, newActiveId)
      return { workspaces: next, activeWorkspaceId: newActiveId }
    })
  },

  setActiveWorkspace: async (id: string | null) => {
    const previousId = get().activeWorkspaceId

    // First workspace activation — snapshot the ad-hoc pins into an "Init"
    // workspace so they stay recoverable, then unload them. Activating a
    // workspace must show that workspace's pins, not these on top of them —
    // and `previousId` is null here, so the deactivation branch below can't
    // do it for us.
    if (id && !previousId && get().workspaces.length <= 1) {
      const initFilePath = await saveInitWorkspace()
      if (initFilePath) removeWorkspacePins(initFilePath)
    }

    // Deactivate previous workspace — remove its pins
    if (previousId && previousId !== id) {
      const prev = get().workspaces.find((w) => w.id === previousId)
      if (prev) {
        removeWorkspacePins(prev.claveFilePath)
      }
    }

    set({ activeWorkspaceId: id })
    // Re-read rather than reusing a pre-await snapshot: saveInitWorkspace may
    // have prepended the Init workspace, and persisting a stale array would
    // write it straight back out of existence.
    persistWorkspaces(get().workspaces, id)

    // Activate new workspace — import its .clave file (pins only, no auto-launch)
    if (id) {
      const workspace = get().workspaces.find((w) => w.id === id)
      if (workspace) {
        await importClaveFile(workspace.claveFilePath, {
          autoLaunch: false,
          rootDir: workspace.rootDir ?? undefined
        })
        // Auto-discover repo .clave files if enabled
        await discoverAndLoadRepoFiles(workspace)
      }
    }
  }
}))

function removeWorkspacePins(filePath: string): void {
  const store = usePinnedStore.getState()
  // Remove workspace's own pins AND any pins auto-discovered by this workspace
  const pinsToRemove = store.pinnedGroups.filter((pg) => pg.filePath === filePath || pg.discoveredBy === filePath)
  for (const pg of pinsToRemove) {
    store.removePinnedGroup(pg.id)
  }
}

/** Read autoDiscover config from workspace file and import discovered repo .clave files */
async function discoverAndLoadRepoFiles(workspace: ClaveWorkspace): Promise<void> {
  const adConfig = await window.electronAPI?.readAutoDiscoverConfig(workspace.claveFilePath)
  if (!adConfig?.enabled) return

  // Derive workspaceId from the workspace file name (e.g. "romain.clave" → "romain")
  const fileName = workspace.claveFilePath.split(/[\\/]/).pop()?.replace('.clave', '') ?? undefined
  const workspaceId = fileName && fileName !== 'default' ? fileName : undefined

  const rootDir = workspace.rootDir || workspace.claveFilePath.replace(/[\\/][^\\/]+$/, '')
  const discovered = await window.electronAPI?.discoverClaveFilesRecursive(rootDir, { ...adConfig, workspaceId })
  if (!discovered?.length) return

  // Filter out the workspace file itself
  const repoFiles = discovered.filter((f) => f.path !== workspace.claveFilePath)

  for (const file of repoFiles) {
    await importClaveFile(file.path, {
      autoLaunch: false,
      rootDir: file.rootDir,
      discoveredBy: workspace.claveFilePath,
      workspaceRoot: rootDir
    })
  }
}

function persistWorkspaces(workspaces: ClaveWorkspace[], activeId: string | null): void {
  window.electronAPI?.preferencesSet('workspaces', workspaces).catch(() => {})
  window.electronAPI?.preferencesSet('activeWorkspaceId', activeId).catch(() => {})
}

/** Save current pinned groups as an "Init" workspace in the app's data folder.
 *  Returns the file the snapshot was written to, or null if nothing was saved. */
async function saveInitWorkspace(): Promise<string | null> {
  const pins = usePinnedStore.getState().pinnedGroups.filter((pg) => !pg.filePath)
  if (pins.length === 0) return null

  try {
    const userDataPath = await window.electronAPI?.getUserDataPath()
    if (!userDataPath) return null

    const initFilePath = `${userDataPath}/workspace.clave`

    // Check if Init workspace already exists
    const store = useWorkspaceStore.getState()
    if (store.workspaces.some((w) => w.claveFilePath === initFilePath)) return null

    // Write current pins as a multi-group .clave file
    const groups = pins.map((pg) => ({
      name: pg.name,
      cwd: pg.cwd,
      color: pg.color,
      ...(pg.toolbar ? { toolbar: true } : {}),
      ...(pg.category ? { category: pg.category } : {}),
      sessions: pg.sessions.map((s) => ({
        cwd: s.cwd,
        name: s.name,
        claudeMode: s.claudeMode,
        antigravityMode: s.antigravityMode,
        codexMode: s.codexMode,
        claudeAgentsMode: s.claudeAgentsMode,
        dangerousMode: s.dangerousMode
      })),
      terminals: pg.terminals.map((t) => ({
        command: t.command,
        commandMode: t.commandMode,
        color: t.color,
        icon: t.icon,
        cwd: t.cwd
      }))
    }))

    await window.electronAPI?.writeClaveFile(initFilePath, { groups })

    // Bind the snapshotted pins to the file we just wrote. Without this they
    // keep `filePath: null`, so removeWorkspacePins() can never match them and
    // the Init pins outlive every workspace switch, piling up alongside the pins
    // of whatever workspace is activated next. `groupIndex` mirrors the
    // multi-group layout written above so watch/sync-back address the right group.
    const pinnedStore = usePinnedStore.getState()
    pins.forEach((pg, i) => {
      pinnedStore.updatePinnedGroup(pg.id, { filePath: initFilePath, groupIndex: i })
    })

    // Register as the "Init" workspace
    const initWorkspace: ClaveWorkspace = {
      id: crypto.randomUUID(),
      name: 'Init',
      claveFilePath: initFilePath
    }

    useWorkspaceStore.setState((s) => {
      const next = [initWorkspace, ...s.workspaces]
      persistWorkspaces(next, s.activeWorkspaceId)
      return { workspaces: next }
    })

    return initFilePath
  } catch (err) {
    console.error('[workspace] Failed to save Init workspace:', err)
    return null
  }
}

/** Migrate old workspace format (path → claveFilePath) */
function migrateWorkspaces(workspaces: unknown[]): ClaveWorkspace[] {
  return workspaces.map((ws: any) => {
    if (ws.claveFilePath) return ws as ClaveWorkspace
    // Old format: path was the folder, file was workspace.clave inside it
    return {
      id: ws.id,
      name: ws.name,
      claveFilePath: `${ws.path}/workspace.clave`
    } as ClaveWorkspace
  })
}

/** Folder containing a file path (string-only dirname for renderer use). */
function dirOf(filePath: string): string {
  return filePath.replace(/[\\/][^\\/]*$/, '') || filePath
}

/** One-time: trust the folders of already-registered workspaces (outside userData). */
async function backfillTrustedRoots(workspaces: ClaveWorkspace[]): Promise<void> {
  try {
    if (await window.electronAPI?.preferencesGet('trustRootsBackfilled')) return
    const userDataPath = await window.electronAPI?.getUserDataPath()
    for (const ws of workspaces) {
      const root = ws.rootDir ?? dirOf(ws.claveFilePath)
      if (userDataPath && root.startsWith(userDataPath)) continue // skip Init/app dir
      await window.electronAPI?.trustWorkspaceRoot(root)
    }
    await window.electronAPI?.preferencesSet('trustRootsBackfilled', true)
  } catch (err) {
    console.error('[workspace] Failed to backfill trusted roots:', err)
  }
}

/** Load workspace config from preferences (call once on app start) */
export async function loadWorkspaces(): Promise<void> {
  const raw = (await window.electronAPI?.preferencesGet('workspaces')) as unknown[] | null
  const activeId = (await window.electronAPI?.preferencesGet('activeWorkspaceId')) as string | null

  const workspaces = raw ? migrateWorkspaces(raw) : []

  // Persist migrated data back
  if (raw && raw.some((ws: any) => !ws.claveFilePath)) {
    window.electronAPI?.preferencesSet('workspaces', workspaces).catch(() => {})
  }

  useWorkspaceStore.setState({
    workspaces,
    activeWorkspaceId: activeId || null,
    loaded: true
  })

  // One-time backfill: existing users added these workspace folders before
  // folder-level trust existed, so retroactively trust them — otherwise the
  // content-hash gate keeps re-prompting for files they already rely on.
  // Exclude the app's own data dir (the generated "Init" workspace lives there).
  await backfillTrustedRoots(workspaces)

  // Auto-load active workspace pins (idle, no auto-launch)
  if (activeId && workspaces.length > 0) {
    const workspace = workspaces.find((w) => w.id === activeId)
    if (workspace) {
      await importClaveFile(workspace.claveFilePath, {
        autoLaunch: false,
        rootDir: workspace.rootDir ?? undefined,
        workspaceRoot: workspace.rootDir ?? dirOf(workspace.claveFilePath)
      })
      // Auto-discover repo .clave files if enabled
      await discoverAndLoadRepoFiles(workspace)
    }
  }
}
