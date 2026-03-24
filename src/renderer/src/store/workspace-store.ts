import { create } from 'zustand'
import { usePinnedStore } from './pinned-store'
import { importClaveFile } from './pinned-store'

export interface ClaveWorkspace {
  id: string
  name: string
  path: string // Absolute path to the folder containing workspace.clave
}

interface WorkspaceState {
  workspaces: ClaveWorkspace[]
  activeWorkspaceId: string | null
  loaded: boolean
  addWorkspace: (folderPath: string) => Promise<boolean>
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string | null) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  loaded: false,

  addWorkspace: async (folderPath: string) => {
    // Check if workspace.clave exists
    const claveFilePath = `${folderPath}/workspace.clave`
    const exists = await window.electronAPI?.claveFileExists(claveFilePath)
    if (!exists) return false

    // Check if already registered
    if (get().workspaces.some((w) => w.path === folderPath)) return false

    const name = folderPath.split('/').pop() || folderPath
    const workspace: ClaveWorkspace = {
      id: crypto.randomUUID(),
      name,
      path: folderPath
    }

    set((s) => {
      const next = [...s.workspaces, workspace]
      persistWorkspaces(next, s.activeWorkspaceId)
      return { workspaces: next }
    })

    return true
  },

  removeWorkspace: (id: string) => {
    set((s) => {
      const next = s.workspaces.filter((w) => w.id !== id)
      const newActiveId = s.activeWorkspaceId === id ? null : s.activeWorkspaceId
      persistWorkspaces(next, newActiveId)

      // If removing the active workspace, unload its pins
      if (s.activeWorkspaceId === id) {
        const workspace = s.workspaces.find((w) => w.id === id)
        if (workspace) {
          removeWorkspacePins(`${workspace.path}/workspace.clave`)
        }
      }

      return { workspaces: next, activeWorkspaceId: newActiveId }
    })
  },

  setActiveWorkspace: async (id: string | null) => {
    const state = get()
    const previousId = state.activeWorkspaceId

    // First workspace activation — snapshot current pins as "Init" workspace
    if (id && !previousId && state.workspaces.length <= 1) {
      await saveInitWorkspace()
    }

    // Deactivate previous workspace — remove its pins
    if (previousId && previousId !== id) {
      const prev = state.workspaces.find((w) => w.id === previousId)
      if (prev) {
        removeWorkspacePins(`${prev.path}/workspace.clave`)
      }
    }

    set({ activeWorkspaceId: id })
    persistWorkspaces(state.workspaces, id)

    // Activate new workspace — import its .clave file (pins only, no auto-launch)
    if (id) {
      const workspace = state.workspaces.find((w) => w.id === id)
      if (workspace) {
        await importClaveFile(`${workspace.path}/workspace.clave`, { autoLaunch: false })
      }
    }
  }
}))

function removeWorkspacePins(filePath: string): void {
  const store = usePinnedStore.getState()
  const pinsToRemove = store.pinnedGroups.filter((pg) => pg.filePath === filePath)
  for (const pg of pinsToRemove) {
    store.removePinnedGroup(pg.id)
  }
}

function persistWorkspaces(workspaces: ClaveWorkspace[], activeId: string | null): void {
  window.electronAPI?.preferencesSet('workspaces', workspaces).catch(() => {})
  window.electronAPI?.preferencesSet('activeWorkspaceId', activeId).catch(() => {})
}

/** Save current pinned groups as an "Init" workspace in the app's data folder */
async function saveInitWorkspace(): Promise<void> {
  const pins = usePinnedStore.getState().pinnedGroups.filter((pg) => !pg.filePath)
  if (pins.length === 0) return

  try {
    const userDataPath = await window.electronAPI?.getUserDataPath()
    if (!userDataPath) return

    const initFilePath = `${userDataPath}/workspace.clave`

    // Check if Init workspace already exists
    const store = useWorkspaceStore.getState()
    if (store.workspaces.some((w) => w.path === userDataPath)) return

    // Write current pins as a multi-group .clave file
    const groups = pins.map((pg) => ({
      name: pg.name,
      cwd: pg.cwd,
      color: pg.color,
      ...(pg.toolbar ? { toolbar: true } : {}),
      sessions: pg.sessions.map((s) => ({
        cwd: s.cwd,
        name: s.name,
        claudeMode: s.claudeMode,
        dangerousMode: s.dangerousMode
      })),
      terminals: pg.terminals.map((t) => ({
        command: t.command,
        commandMode: t.commandMode,
        color: t.color,
        icon: t.icon
      }))
    }))

    await window.electronAPI?.writeClaveFile(initFilePath, { groups })

    // Register as the "Init" workspace
    const initWorkspace: ClaveWorkspace = {
      id: crypto.randomUUID(),
      name: 'Init',
      path: userDataPath
    }

    useWorkspaceStore.setState((s) => {
      const next = [initWorkspace, ...s.workspaces]
      persistWorkspaces(next, s.activeWorkspaceId)
      return { workspaces: next }
    })
  } catch (err) {
    console.error('[workspace] Failed to save Init workspace:', err)
  }
}

/** Load workspace config from preferences (call once on app start) */
export async function loadWorkspaces(): Promise<void> {
  const workspaces = (await window.electronAPI?.preferencesGet('workspaces')) as ClaveWorkspace[] | null
  const activeId = (await window.electronAPI?.preferencesGet('activeWorkspaceId')) as string | null

  useWorkspaceStore.setState({
    workspaces: workspaces || [],
    activeWorkspaceId: activeId || null,
    loaded: true
  })

  // Auto-load active workspace pins (idle, no auto-launch)
  if (activeId && workspaces) {
    const workspace = workspaces.find((w) => w.id === activeId)
    if (workspace) {
      await importClaveFile(`${workspace.path}/workspace.clave`, { autoLaunch: false })
    }
  }
}
