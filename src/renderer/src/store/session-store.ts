import { create } from 'zustand'
import type {
  Theme,
  AppIcon,
  ActivityStatus,
  GroupTerminalConfig,
  GroupTerminalColor,
  GroupTerminalIcon,
  Session,
  SessionGroup,
  FileTab,
  ActiveView,
  SessionType
} from './session-types'
import type { Agent, AgentStatus } from '../../../shared/remote-types'

// Re-export types and constants so existing imports continue to work
export type { Theme, AppIcon, ActivityStatus, GroupTerminalConfig, GroupTerminalColor, GroupTerminalIcon, Session, SessionGroup, FileTab, ActiveView, SessionType }
export { GROUP_TERMINAL_COLORS, GROUP_TERMINAL_ICONS, TERMINAL_COLOR_VALUES, resolveColorHex } from './session-types'

interface SessionState {
  sessions: Session[]
  fileTabs: FileTab[]
  focusedSessionId: string | null
  selectedSessionIds: string[]
  groups: SessionGroup[]
  displayOrder: string[]
  sidebarOpen: boolean
  sidebarWidth: number
  theme: Theme
  appIcon: AppIcon
  searchQuery: string
  claudeMode: boolean
  dangerousMode: boolean
  filePaletteOpen: boolean
  fileTreeOpen: boolean
  fileTreeWidth: number
  fileTreeWidthOverride: number | null
  previewFile: string | null
  previewCwd: string | null
  previewSource: 'palette' | 'tree' | null
  previewLocationId: string | null
  diffPreview: { file: string, cwd: string, type: 'working' | 'commit', staged: boolean, fileStatus: string, hash: string | null, siblings?: Array<{ file: string; staged: boolean; fileStatus: string }>, clickY?: number } | null
  gitRefreshTrigger: number
  collapseAllTrigger: number
  activeView: ActiveView
  sidePanelTab: 'files' | 'git' | 'help'
  gitViewMode: 'list' | 'tree'
  gitPanelMode: 'changes' | 'log'
  journeyPanel: { cwd: string; repoName: string } | null
  commitMessages: Record<string, string>
  generatingCommitCwds: Set<string>
  hiddenAgentIds: Set<string>
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  selectSession: (id: string, addToSelection: boolean) => void
  selectSessions: (ids: string[]) => void
  setFocusedSession: (id: string) => void
  createGroup: (sessionIds: string[], name?: string) => void
  ungroupSessions: (groupId: string) => void
  deleteGroup: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  addGroupTerminal: (groupId: string, config: Omit<GroupTerminalConfig, 'sessionId'>) => void
  removeGroupTerminal: (groupId: string, terminalId: string) => void
  updateGroupTerminal: (groupId: string, terminalId: string, updates: Partial<Pick<GroupTerminalConfig, 'command' | 'commandMode' | 'color' | 'icon'>>) => void
  setGroupTerminalSessionId: (groupId: string, terminalId: string, sessionId: string | null) => void
  setGroupCwd: (groupId: string, cwd: string) => void
  setGroupColor: (groupId: string, color: GroupTerminalColor | null) => void
  moveItems: (
    itemIds: string[],
    targetId: string,
    position: 'before' | 'after' | 'inside'
  ) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  setTheme: (theme: Theme) => void
  setAppIcon: (icon: AppIcon) => void
  updateSessionAlive: (id: string, alive: boolean) => void
  setSessionActivity: (id: string, status: ActivityStatus) => void
  setSessionPromptWaiting: (id: string, promptType: string | null) => void
  setSessionDetectedUrl: (id: string, url: string | null) => void
  setSessionServerStatus: (id: string, status: import('./session-types').ServerStatus) => void
  setSessionServerCommand: (id: string, command: string | null) => void
  setSessionUnseenActivity: (id: string, unseen: boolean) => void
  renameSession: (id: string, name: string) => void
  autoRenameSession: (id: string, name: string) => void
  resetSessionName: (id: string) => void
  setSessionPlanFile: (id: string, path: string) => void
  setSearchQuery: (query: string) => void
  toggleClaudeMode: () => void
  toggleDangerousMode: () => void
  toggleFilePalette: () => void
  setFilePaletteOpen: (open: boolean) => void
  toggleFileTree: () => void
  setFileTreeWidth: (width: number) => void
  setFileTreeWidthOverride: (width: number | null) => void
  setActiveView: (view: ActiveView) => void
  setSidePanelTab: (tab: 'files' | 'git' | 'help') => void
  setGitViewMode: (mode: 'list' | 'tree') => void
  setGitPanelMode: (mode: 'changes' | 'log') => void
  openJourneyPanel: (cwd: string, repoName: string) => void
  closeJourneyPanel: () => void
  setCommitMessage: (cwd: string, message: string) => void
  setGeneratingCommit: (cwd: string, generating: boolean) => void
  setPreviewFile: (path: string | null, source?: 'palette' | 'tree', cwd?: string | null, locationId?: string | null) => void
  setDiffPreview: (preview: SessionState['diffPreview'], opts?: { fromJourney?: boolean }) => void
  triggerGitRefresh: () => void
  triggerCollapseAll: () => void
  addFileTab: (tab: FileTab) => void
  removeFileTab: (id: string) => void
  renameFileTab: (id: string, name: string) => void
  setClaudeSessionId: (id: string, claudeSessionId: string) => void
  addAgentSession: (agent: Agent, locationId: string) => void
  removeAgentSessions: (locationId: string) => void
  updateAgentSessionStatus: (agentId: string, locationId: string, status: AgentStatus) => void
  isAgentInSidebar: (agentId: string, locationId: string) => boolean
  hideAgentSession: (sessionId: string) => void
}

let groupCounter = 0

export function getDisplayOrder(state: {
  sessions: Session[]
  groups: SessionGroup[]
  displayOrder: string[]
}): string[] {
  if (state.displayOrder.length > 0) return [...state.displayOrder]
  const order: string[] = []
  const placedGroups = new Set<string>()
  for (const session of state.sessions) {
    const group = state.groups.find((g) => g.sessionIds.includes(session.id))
    if (group) {
      if (!placedGroups.has(group.id)) {
        placedGroups.add(group.id)
        order.push(group.id)
      }
    } else {
      order.push(session.id)
    }
  }
  return order
}

export function isFileTabId(id: string): boolean {
  return id.startsWith('file-')
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  fileTabs: [],
  focusedSessionId: null,
  selectedSessionIds: [],
  groups: [],
  displayOrder: [],
  sidebarOpen: true,
  sidebarWidth: 260,
  theme: (localStorage.getItem('clave-theme') as Theme) || 'coffee',
  appIcon: (localStorage.getItem('clave-app-icon') as AppIcon) || 'dark',
  searchQuery: '',
  claudeMode: true,
  dangerousMode: false,
  filePaletteOpen: false,
  fileTreeOpen: false,
  fileTreeWidth: 240,
  fileTreeWidthOverride: null,
  previewFile: null,
  previewCwd: null,
  previewSource: null,
  previewLocationId: null,
  diffPreview: null,
  gitRefreshTrigger: 0,
  collapseAllTrigger: 0,
  activeView: 'terminals' as ActiveView,
  sidePanelTab: 'files' as const,
  gitViewMode: (localStorage.getItem('clave-git-view-mode') === 'tree' ? 'tree' : 'list') as 'list' | 'tree',
  gitPanelMode: 'changes' as const,
  journeyPanel: null,
  commitMessages: {} as Record<string, string>,
  generatingCommitCwds: new Set<string>(),
  hiddenAgentIds: new Set<string>(
    JSON.parse(localStorage.getItem('clave-hidden-agent-ids') || '[]')
  ),
  addSession: (session) =>
    set((state) => {
      const newSession = { ...session, detectedUrl: session.detectedUrl ?? null, serverStatus: session.serverStatus ?? null, serverCommand: session.serverCommand ?? null, hasUnseenActivity: session.hasUnseenActivity ?? false, userRenamed: session.userRenamed ?? false, planFilePath: session.planFilePath ?? null }

      // Check if selected sessions all belong to a single group
      const selectedIds = state.selectedSessionIds
      let targetGroup: SessionGroup | undefined
      if (selectedIds.length > 0) {
        const group = state.groups.find((g) =>
          selectedIds.every((sid) => g.sessionIds.includes(sid))
        )
        if (group) targetGroup = group
      }

      if (targetGroup) {
        // Add session inside the selected group
        return {
          sessions: [...state.sessions, newSession],
          selectedSessionIds: [session.id],
          focusedSessionId: session.id,
          activeView: 'terminals',
          groups: state.groups.map((g) =>
            g.id === targetGroup!.id
              ? { ...g, sessionIds: [...g.sessionIds, session.id] }
              : g
          ),
          displayOrder: getDisplayOrder(state)
        }
      }

      return {
        sessions: [...state.sessions, newSession],
        selectedSessionIds: [session.id],
        focusedSessionId: session.id,
        activeView: 'terminals',
        displayOrder: [...getDisplayOrder(state), session.id]
      }
    }),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      const selectedSessionIds = state.selectedSessionIds.filter((sid) => sid !== id)
      const groups = state.groups.map((g) => ({
        ...g,
        sessionIds: g.sessionIds.filter((sid) => sid !== id),
        terminals: g.terminals.map((t) =>
          t.sessionId === id ? { ...t, sessionId: null } : t
        )
      }))
      const displayOrder = getDisplayOrder(state).filter((did) => did !== id)

      let focusedSessionId = state.focusedSessionId
      if (focusedSessionId === id) {
        focusedSessionId = selectedSessionIds[0] ?? sessions[sessions.length - 1]?.id ?? null
      }
      if (selectedSessionIds.length === 0 && sessions.length > 0) {
        const lastId = sessions[sessions.length - 1].id
        return {
          sessions,
          selectedSessionIds: [lastId],
          focusedSessionId: lastId,
          groups,
          displayOrder
        }
      }

      return { sessions, selectedSessionIds, focusedSessionId, groups, displayOrder }
    }),

  selectSession: (id, addToSelection) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id)
      const targetView: ActiveView = session?.sessionType === 'agent' ? 'agents' : 'terminals'
      // Clear unseen activity when session is selected
      const sessions = session?.hasUnseenActivity
        ? state.sessions.map((s) => s.id === id ? { ...s, hasUnseenActivity: false } : s)
        : state.sessions
      if (addToSelection) {
        const isSelected = state.selectedSessionIds.includes(id)
        const newSelected = isSelected
          ? state.selectedSessionIds.filter((sid) => sid !== id)
          : [...state.selectedSessionIds, id]
        const focusedSessionId = isSelected ? (newSelected[0] ?? null) : id
        return { sessions, selectedSessionIds: newSelected, focusedSessionId, activeView: targetView }
      }
      return { sessions, selectedSessionIds: [id], focusedSessionId: id, activeView: targetView }
    }),

  selectSessions: (ids) =>
    set(() => ({
      selectedSessionIds: ids,
      focusedSessionId: ids[0] ?? null,
      activeView: 'terminals' as ActiveView
    })),

  setFocusedSession: (id) => set(() => ({ focusedSessionId: id })),

  createGroup: (sessionIds, name?) =>
    set((state) => {
      groupCounter++
      const groupName = name || `Group ${groupCounter}`
      const firstSession = state.sessions.find((s) => sessionIds.includes(s.id))
      const newGroup: SessionGroup = {
        id: `group-${Date.now()}-${groupCounter}`,
        name: groupName,
        sessionIds: [...sessionIds],
        collapsed: false,
        cwd: firstSession?.cwd ?? null,
        terminals: []
      }
      // Remove these sessions from any existing groups
      const groups = state.groups.map((g) => ({
        ...g,
        sessionIds: g.sessionIds.filter((sid) => !sessionIds.includes(sid))
      }))

      // Update displayOrder: replace first session with group ID, remove rest
      let displayOrder = getDisplayOrder(state)
      let inserted = false
      displayOrder = displayOrder.reduce<string[]>((acc, id) => {
        if (sessionIds.includes(id)) {
          if (!inserted) {
            inserted = true
            acc.push(newGroup.id)
          }
        } else {
          acc.push(id)
        }
        return acc
      }, [])
      if (!inserted) displayOrder.push(newGroup.id)

      return { groups: [...groups, newGroup], displayOrder }
    }),

  ungroupSessions: (groupId) =>
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return {}

      // Replace group ID in displayOrder with its session IDs
      const displayOrder = getDisplayOrder(state)
      const idx = displayOrder.indexOf(groupId)
      if (idx !== -1) {
        displayOrder.splice(idx, 1, ...group.sessionIds)
      }

      return {
        groups: state.groups.filter((g) => g.id !== groupId),
        displayOrder
      }
    }),

  deleteGroup: (groupId) =>
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return {}

      const terminalSessionIds = group.terminals
        .map((t) => t.sessionId)
        .filter((id): id is string => id !== null)
      const sessionIdsToRemove = new Set([...group.sessionIds, ...terminalSessionIds])
      const sessions = state.sessions.filter((s) => !sessionIdsToRemove.has(s.id))
      const selectedSessionIds = state.selectedSessionIds.filter(
        (sid) => !sessionIdsToRemove.has(sid)
      )
      const displayOrder = getDisplayOrder(state).filter(
        (did) => did !== groupId && !sessionIdsToRemove.has(did)
      )
      const groups = state.groups.filter((g) => g.id !== groupId)

      let focusedSessionId = state.focusedSessionId
      if (focusedSessionId && sessionIdsToRemove.has(focusedSessionId)) {
        focusedSessionId = selectedSessionIds[0] ?? sessions[sessions.length - 1]?.id ?? null
      }
      if (selectedSessionIds.length === 0 && sessions.length > 0) {
        const lastId = sessions[sessions.length - 1].id
        return {
          sessions,
          selectedSessionIds: [lastId],
          focusedSessionId: lastId,
          groups,
          displayOrder
        }
      }

      return { sessions, selectedSessionIds, focusedSessionId, groups, displayOrder }
    }),

  renameGroup: (groupId, name) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, name: name.trim() || 'Group' } : g
      )
    })),

  toggleGroupCollapsed: (groupId) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
    })),

  addGroupTerminal: (groupId, config) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, terminals: [...g.terminals, { ...config, sessionId: null }] }
          : g
      )
    })),

  removeGroupTerminal: (groupId, terminalId) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, terminals: g.terminals.filter((t) => t.id !== terminalId) }
          : g
      )
    })),

  updateGroupTerminal: (groupId, terminalId, updates) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              terminals: g.terminals.map((t) =>
                t.id === terminalId ? { ...t, ...updates } : t
              )
            }
          : g
      )
    })),

  setGroupTerminalSessionId: (groupId, terminalId, sessionId) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              terminals: g.terminals.map((t) =>
                t.id === terminalId ? { ...t, sessionId } : t
              )
            }
          : g
      )
    })),

  setGroupCwd: (groupId, cwd) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, cwd } : g
      )
    })),

  setGroupColor: (groupId, color) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, color } : g
      )
    })),

  moveItems: (itemIds, targetId, position) =>
    set((state) => {
      const displayOrder = getDisplayOrder(state)
      const newGroups = state.groups.map((g) => ({
        ...g,
        sessionIds: [...g.sessionIds]
      }))

      const targetIsGroup = newGroups.some((g) => g.id === targetId)
      const targetParentGroup = newGroups.find((g) => g.sessionIds.includes(targetId))

      // Remove dragged items from current locations
      for (const id of itemIds) {
        const idx = displayOrder.indexOf(id)
        if (idx !== -1) displayOrder.splice(idx, 1)
        for (const g of newGroups) {
          const sIdx = g.sessionIds.indexOf(id)
          if (sIdx !== -1) g.sessionIds.splice(sIdx, 1)
        }
      }

      if (position === 'inside' && targetIsGroup) {
        // Drop into group
        const group = newGroups.find((g) => g.id === targetId)!
        group.sessionIds.push(...itemIds)
      } else if (targetParentGroup && !targetIsGroup) {
        // Target is inside a group → reorder within group
        const idx = targetParentGroup.sessionIds.indexOf(targetId)
        const insertIdx = position === 'after' ? idx + 1 : idx
        targetParentGroup.sessionIds.splice(insertIdx, 0, ...itemIds)
      } else {
        // Target is top-level → reorder in displayOrder
        const idx = displayOrder.indexOf(targetId)
        if (idx === -1) {
          displayOrder.push(...itemIds)
        } else {
          const insertIdx = position === 'after' ? idx + 1 : idx
          displayOrder.splice(insertIdx, 0, ...itemIds)
        }
      }

      // Remove empty groups
      const emptyGroupIds = newGroups
        .filter((g) => g.sessionIds.length === 0)
        .map((g) => g.id)
      const finalGroups = newGroups.filter((g) => g.sessionIds.length > 0)
      const finalDisplayOrder = displayOrder.filter((id) => !emptyGroupIds.includes(id))

      return { displayOrder: finalDisplayOrder, groups: finalGroups }
    }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(180, Math.min(480, width)) }),

  setTheme: (theme) => {
    localStorage.setItem('clave-theme', theme)
    set({ theme })
  },

  setAppIcon: (appIcon) => {
    localStorage.setItem('clave-app-icon', appIcon)
    set({ appIcon })
    window.electronAPI?.setAppIcon(appIcon)
  },

  updateSessionAlive: (id, alive) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, alive, ...(!alive && { activityStatus: 'ended' as const }) } : s
      )
    })),

  setSessionActivity: (id, status) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id)
      if (!session || session.activityStatus === status) return state
      return {
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, activityStatus: status } : s))
      }
    }),

  setSessionPromptWaiting: (id, promptType) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, promptWaiting: promptType } : s
      )
    })),

  setSessionDetectedUrl: (id, url) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id)
      if (!session) return state
      // Skip if URL unchanged AND already running (avoid unnecessary re-renders)
      if (session.detectedUrl === url && (!url || session.serverStatus === 'running')) return state

      // Auto-launch localhost if the session's terminal config has the flag
      if (url && window.electronAPI?.openExternal) {
        const group = state.groups.find((g) =>
          g.terminals.some((t) => t.sessionId === id)
        )
        const terminal = group?.terminals.find((t) => t.sessionId === id)
        if (terminal?.autoLaunchLocalhost) {
          window.electronAPI.openExternal(url)
        }
      }

      return {
        sessions: state.sessions.map((s) =>
          s.id === id ? { ...s, detectedUrl: url, serverStatus: url ? 'running' : s.serverStatus } : s
        )
      }
    }),

  setSessionServerStatus: (id, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, serverStatus: status } : s
      )
    })),

  setSessionServerCommand: (id, command) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, serverCommand: command } : s
      )
    })),

  setSessionUnseenActivity: (id, unseen) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id)
      if (!session || session.hasUnseenActivity === unseen) return state
      return {
        sessions: state.sessions.map((s) =>
          s.id === id ? { ...s, hasUnseenActivity: unseen } : s
        )
      }
    }),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name: name.trim() || s.folderName, userRenamed: true } : s
      )
    })),

  autoRenameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id && !s.userRenamed ? { ...s, name: name.trim() || s.name } : s
      )
    })),

  resetSessionName: (id) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name: s.folderName, userRenamed: false } : s
      )
    })),

  setSessionPlanFile: (id, path) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, planFilePath: path } : s
      )
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleClaudeMode: () => set((state) => ({ claudeMode: !state.claudeMode })),

  toggleDangerousMode: () => set((state) => ({ dangerousMode: !state.dangerousMode })),

  toggleFilePalette: () => set((state) => ({ filePaletteOpen: !state.filePaletteOpen })),

  setFilePaletteOpen: (open) => set({ filePaletteOpen: open }),

  toggleFileTree: () => set((state) => ({ fileTreeOpen: !state.fileTreeOpen })),

  setFileTreeWidth: (width) => set({ fileTreeWidth: Math.max(180, Math.min(400, width)) }),

  setFileTreeWidthOverride: (width) => set({ fileTreeWidthOverride: width }),

  setActiveView: (view) => set({ activeView: view }),

  setSidePanelTab: (tab) => set({ sidePanelTab: tab }),

  setGitViewMode: (mode) => {
    localStorage.setItem('clave-git-view-mode', mode)
    set({ gitViewMode: mode })
  },

  setGitPanelMode: (mode) => set({ gitPanelMode: mode }),

  openJourneyPanel: (cwd, repoName) =>
    set({ journeyPanel: { cwd, repoName }, diffPreview: null, previewFile: null, previewCwd: null, previewSource: null, previewLocationId: null }),

  closeJourneyPanel: () => set({ journeyPanel: null, diffPreview: null }),

  setCommitMessage: (cwd, message) =>
    set((state) => ({
      commitMessages: { ...state.commitMessages, [cwd]: message }
    })),

  setGeneratingCommit: (cwd, generating) =>
    set((state) => {
      const next = new Set(state.generatingCommitCwds)
      if (generating) next.add(cwd)
      else next.delete(cwd)
      return { generatingCommitCwds: next }
    }),

  setPreviewFile: (path, source, cwd, locationId) =>
    set((state) => ({ previewFile: path, previewCwd: cwd ?? null, previewSource: source ?? null, previewLocationId: locationId ?? null, diffPreview: path ? null : state.diffPreview })),

  setDiffPreview: (preview, opts) =>
    set({
      diffPreview: preview,
      ...(preview ? { previewFile: null, previewCwd: null, previewSource: null, previewLocationId: null } : {}),
      ...(preview && !opts?.fromJourney ? { journeyPanel: null } : {})
    }),

  triggerGitRefresh: () => set((state) => ({ gitRefreshTrigger: state.gitRefreshTrigger + 1 })),

  triggerCollapseAll: () => set((state) => ({ collapseAllTrigger: state.collapseAllTrigger + 1 })),

  addFileTab: (tab) =>
    set((state) => {
      // Dedup by filePath
      const existing = state.fileTabs.find((f) => f.filePath === tab.filePath)
      if (existing) {
        return {
          selectedSessionIds: [existing.id],
          focusedSessionId: existing.id,
          activeView: 'terminals' as ActiveView
        }
      }
      return {
        fileTabs: [...state.fileTabs, tab],
        displayOrder: [...getDisplayOrder(state), tab.id],
        selectedSessionIds: [tab.id],
        focusedSessionId: tab.id,
        activeView: 'terminals' as ActiveView
      }
    }),

  removeFileTab: (id) =>
    set((state) => {
      const fileTabs = state.fileTabs.filter((f) => f.id !== id)
      const selectedSessionIds = state.selectedSessionIds.filter((sid) => sid !== id)
      const displayOrder = getDisplayOrder(state).filter((did) => did !== id)
      const groups = state.groups.map((g) => ({
        ...g,
        sessionIds: g.sessionIds.filter((sid) => sid !== id)
      }))

      let focusedSessionId = state.focusedSessionId
      if (focusedSessionId === id) {
        focusedSessionId = selectedSessionIds[0] ?? state.sessions[state.sessions.length - 1]?.id ?? null
      }
      if (selectedSessionIds.length === 0 && state.sessions.length > 0) {
        const lastId = state.sessions[state.sessions.length - 1].id
        return {
          fileTabs,
          selectedSessionIds: [lastId],
          focusedSessionId: lastId,
          groups,
          displayOrder
        }
      }

      return { fileTabs, selectedSessionIds, focusedSessionId, groups, displayOrder }
    }),

  renameFileTab: (id, name) =>
    set((state) => ({
      fileTabs: state.fileTabs.map((f) =>
        f.id === id ? { ...f, name: name.trim() || f.filePath.split(/[\\/]/).pop() || 'file' } : f
      )
    })),

  setClaudeSessionId: (id, claudeSessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, claudeSessionId } : s
      )
    })),

  addAgentSession: (agent, locationId) =>
    set((state) => {
      const sessionId = `agent-${locationId}-${agent.id}`
      if (state.sessions.some((s) => s.id === sessionId)) return {}
      const session: Session = {
        id: sessionId,
        cwd: agent.cwd ?? '',
        folderName: agent.name,
        name: agent.name,
        alive: agent.status !== 'offline',
        activityStatus: agent.status === 'busy' ? 'active' : agent.status === 'offline' ? 'ended' : 'idle',
        promptWaiting: null,
        claudeMode: false,
        dangerousMode: false,
        claudeSessionId: null,
        locationId,
        sessionType: 'agent',
        agentId: agent.id,
        detectedUrl: null,
        serverStatus: null,
        serverCommand: null,
        hasUnseenActivity: false,
        userRenamed: false,
        planFilePath: null
      }
      return {
        sessions: [...state.sessions, session],
        displayOrder: [...getDisplayOrder(state), sessionId]
      }
    }),

  removeAgentSessions: (locationId) =>
    set((state) => {
      const agentSessionIds = new Set(
        state.sessions.filter((s) => s.sessionType === 'agent' && s.locationId === locationId).map((s) => s.id)
      )
      if (agentSessionIds.size === 0) return {}
      return {
        sessions: state.sessions.filter((s) => !agentSessionIds.has(s.id)),
        displayOrder: getDisplayOrder(state).filter((id) => !agentSessionIds.has(id)),
        selectedSessionIds: state.selectedSessionIds.filter((id) => !agentSessionIds.has(id)),
        focusedSessionId: agentSessionIds.has(state.focusedSessionId ?? '') ? null : state.focusedSessionId
      }
    }),

  updateAgentSessionStatus: (agentId, locationId, status) =>
    set((state) => {
      const sessionId = `agent-${locationId}-${agentId}`
      const alive = status !== 'offline'
      const activityStatus: import('./session-types').ActivityStatus =
        status === 'busy' ? 'active' : status === 'offline' ? 'ended' : 'idle'
      return {
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, alive, activityStatus } : s
        )
      }
    }),

  isAgentInSidebar: (agentId, locationId) => {
    const state = useSessionStore.getState()
    return state.sessions.some((s) => s.id === `agent-${locationId}-${agentId}`)
  },

  hideAgentSession: (sessionId) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === sessionId)
      if (!session?.agentId || !session.locationId) return {}
      const compositeId = `${session.locationId}-${session.agentId}`
      const newHidden = new Set(state.hiddenAgentIds)
      newHidden.add(compositeId)
      localStorage.setItem('clave-hidden-agent-ids', JSON.stringify([...newHidden]))
      return {
        hiddenAgentIds: newHidden,
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        displayOrder: getDisplayOrder(state).filter((id) => id !== sessionId),
        selectedSessionIds: state.selectedSessionIds.filter((id) => id !== sessionId),
        focusedSessionId: state.focusedSessionId === sessionId ? null : state.focusedSessionId
      }
    })
}))
