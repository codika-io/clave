import { emitTabClosed } from '../lib/exchange-capture'
import { create } from 'zustand'
import type {
  Theme,
  AppIcon,
  ActivityStatus,
  GroupTerminalConfig,
  GroupTerminalColor,
  GroupTerminalIcon,
  GroupViewConfig,
  Session,
  SessionGroup,
  FileTab,
  ActiveView,
  SettingsSection,
  ExtensionsSection,
  SessionType
} from './session-types'
import type { Agent, AgentStatus } from '../../../shared/remote-types'
import { useWorkspaceStore } from './workspace-store'

// Re-export types and constants so existing imports continue to work
export type { Theme, AppIcon, ActivityStatus, GroupTerminalConfig, GroupTerminalColor, GroupTerminalIcon, GroupViewConfig, Session, SessionGroup, FileTab, ActiveView, SettingsSection, ExtensionsSection, SessionType }
export { GROUP_TERMINAL_COLORS, GROUP_TERMINAL_ICONS, TERMINAL_COLOR_VALUES, resolveColorHex } from './session-types'

/** THE visibility predicate — single source of truth for workspace scoping.
 *  activeId null → no-workspace mode, everything visible (today's app).
 *  x.workspaceId null/undefined → unstamped safety net: nothing can ever
 *  disappear because it predates the workspace model. */
export function inActiveWorkspace(
  x: { workspaceId?: string | null },
  activeId: string | null
): boolean {
  if (activeId === null) return true
  if (x.workspaceId == null) return true
  return x.workspaceId === activeId
}

interface SessionState {
  sessions: Session[]
  fileTabs: FileTab[]
  focusedSessionId: string | null
  selectedSessionIds: string[]
  groups: SessionGroup[]
  displayOrder: string[]
  /** Group whose attached web view fills the main pane instead of the session
   *  mosaic (set by clicking a group that has a view). Cleared by any explicit
   *  tab selection. Stale ids are harmless — the grid re-validates. */
  activeGroupViewId: string | null
  sidebarOpen: boolean
  sidebarWidth: number
  theme: Theme
  appIcon: AppIcon
  /** Run new sessions inside persistent tmux sessions. On by default; falls
   *  back to a plain shell automatically when tmux isn't installed. */
  tmuxMode: boolean
  searchQuery: string
  claudeMode: boolean
  antigravityMode: boolean
  codexMode: boolean
  claudeAgentsMode: boolean
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
  settingsSection: SettingsSection
  extensionsSection: ExtensionsSection
  sidePanelTab: 'files' | 'git' | 'help'
  gitViewMode: 'list' | 'tree'
  gitPanelMode: 'changes' | 'log'
  /** Per-repo commit bar (message box, commit, push/pull). Hidden by default —
   *  agents commit and push; the panel is for reading state. */
  gitShowCommitBar: boolean
  /** Above this many repos, the multi-repo git panel stops auto-polling and
   *  switches to event-driven + manual refresh (see use-multi-repo-status). */
  gitLivePollLimit: number
  /** When true, never pause live updates regardless of repo count. */
  gitLivePollAlways: boolean
  journeyPanel: { cwd: string; repoName: string } | null
  commitMessages: Record<string, string>
  generatingCommitCwds: Set<string>
  hiddenAgentIds: Set<string>
  sidebarUndoStack: SidebarSnapshot[]
  /** Last selection/focus per workspace, restored when switching back so each
   *  workspace feels like the tab set you left. Session-lifetime only. */
  workspaceSelections: Record<string, { selectedSessionIds: string[]; focusedSessionId: string | null }>
  /** Save the outgoing workspace's selection and restore (or initialize) the
   *  incoming one's. Pure view/selection change — sessions are untouched. */
  applyWorkspaceSwitch: (fromId: string | null, toId: string | null) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  resetSessions: () => Promise<void>
  /** Rebuild groups + display order from a persisted layout after tmux-backed
   *  sessions have been re-adopted on launch. Dangling references (sessions
   *  whose tmux session did not survive) are pruned. */
  restoreGroups: (
    survivingSessionIds: string[],
    persisted: { groups: SessionGroup[]; displayOrder: string[] }
  ) => void
  selectSession: (id: string, addToSelection: boolean) => void
  selectSessions: (ids: string[]) => void
  setFocusedSession: (id: string) => void
  createGroup: (sessionIds: string[], name?: string, workspaceId?: string) => void
  ungroupSessions: (groupId: string) => void
  deleteGroup: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  /** Attach (or clear, with null) a group's web view. */
  setGroupView: (groupId: string, view: GroupViewConfig | null) => void
  /** Show (or hide, with null) a group's web view in the main pane. */
  setActiveGroupView: (groupId: string | null) => void
  addGroupTerminal: (groupId: string, config: Omit<GroupTerminalConfig, 'sessionId'>) => void
  removeGroupTerminal: (groupId: string, terminalId: string) => void
  updateGroupTerminal: (groupId: string, terminalId: string, updates: Partial<Pick<GroupTerminalConfig, 'command' | 'commandMode' | 'color' | 'icon'>>) => void
  setGroupTerminalSessionId: (groupId: string, terminalId: string, sessionId: string | null) => void
  setGroupCwd: (groupId: string, cwd: string) => void
  setGroupColor: (groupId: string, color: GroupTerminalColor | null) => void
  /** Set (or clear, with null) the group's default prompt — what sessions
   *  launched from the group's own `+` start on. */
  setGroupPrompt: (groupId: string, prompt: string | null) => void
  moveItems: (
    itemIds: string[],
    targetId: string,
    position: 'before' | 'after' | 'inside'
  ) => void
  undoSidebar: () => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  setTheme: (theme: Theme) => void
  setAppIcon: (icon: AppIcon) => void
  setTmuxMode: (enabled: boolean) => void
  updateSessionAlive: (id: string, alive: boolean) => void
  setSessionActivity: (id: string, status: ActivityStatus) => void
  setAgentState: (id: string, state: import('./session-types').AgentRunState) => void
  setSessionPromptWaiting: (id: string, promptType: string | null) => void
  setSessionDetectedUrl: (id: string, url: string | null) => void
  setSessionServerStatus: (id: string, status: import('./session-types').ServerStatus) => void
  setSessionServerCommand: (id: string, command: string | null) => void
  setSessionUnseenActivity: (id: string, unseen: boolean) => void
  setSessionInjectedFrom: (id: string, from: string | null) => void
  renameSession: (id: string, name: string) => void
  autoRenameSession: (id: string, name: string) => void
  resetSessionName: (id: string) => void
  setSessionPlanFile: (id: string, path: string) => void
  setSearchQuery: (query: string) => void
  toggleClaudeMode: () => void
  toggleAntigravityMode: () => void
  toggleCodexMode: () => void
  toggleClaudeAgentsMode: () => void
  toggleDangerousMode: () => void
  toggleFilePalette: () => void
  setFilePaletteOpen: (open: boolean) => void
  toggleFileTree: () => void
  setFileTreeWidth: (width: number) => void
  setFileTreeWidthOverride: (width: number | null) => void
  setActiveView: (view: ActiveView) => void
  setSettingsSection: (section: SettingsSection) => void
  /** Switch to the settings view, optionally jumping to a specific section. */
  openSettings: (section?: SettingsSection) => void
  setExtensionsSection: (section: ExtensionsSection) => void
  /** Switch to the extensions view, optionally jumping to a specific section. */
  openExtensions: (section?: ExtensionsSection) => void
  setSidePanelTab: (tab: 'files' | 'git' | 'help') => void
  setGitViewMode: (mode: 'list' | 'tree') => void
  setGitPanelMode: (mode: 'changes' | 'log') => void
  setGitShowCommitBar: (show: boolean) => void
  setGitLivePollLimit: (limit: number) => void
  setGitLivePollAlways: (always: boolean) => void
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
  setFileTabDiffStaged: (id: string, staged: boolean) => void
  setClaudeSessionId: (id: string, claudeSessionId: string) => void
  addAgentSession: (agent: Agent, locationId: string) => void
  removeAgentSessions: (locationId: string) => void
  updateAgentSessionStatus: (agentId: string, locationId: string, status: AgentStatus) => void
  isAgentInSidebar: (agentId: string, locationId: string) => boolean
  hideAgentSession: (sessionId: string) => void
}

let groupCounter = 0

// Groups (and the sidebar ordering that nests them) live only in memory during
// a run. tmux-backed sessions survive an app restart and get re-adopted, but
// the group objects that organize them would otherwise be lost. They are
// persisted from the main process (see sidebar-layout-manager) — written to a
// file synchronously on every change so they survive a hard kill (Ctrl+C /
// crash) that drops Chromium's lazily-flushed localStorage.
//
// Persistence stays disabled until `enableSidebarPersistence()` runs on launch,
// AFTER the previous layout has been read and groups restored. This prevents the
// empty initial state — written as sessions re-adopt — from clobbering the file
// before we've had a chance to load it.
let sidebarPersistEnabled = false
let lastPersistedGroups: SessionGroup[] | null = null
let lastPersistedOrder: string[] | null = null

function persistSidebarLayout(groups: SessionGroup[], displayOrder: string[]): void {
  if (groups === lastPersistedGroups && displayOrder === lastPersistedOrder) return
  lastPersistedGroups = groups
  lastPersistedOrder = displayOrder
  window.electronAPI?.sidebarLayoutSave?.({ groups, displayOrder }).catch(() => {
    // Persistence failures are non-fatal — groups stay in memory for this run.
  })
}

/** Mirror a session's tab name into its tmux sidecar (main process), so the
 *  rename survives a restart, a crash, or a reboot. The store itself lives in
 *  the renderer and dies with the window, which is why a renamed tab used to
 *  come back as its folder name. A name equal to the folder name is stored as
 *  "no name", so the tab tracks the folder if nothing was ever set. */
function persistSessionName(
  id: string,
  name: string,
  folderName: string,
  userRenamed: boolean
): void {
  window.electronAPI?.setSessionDisplayName?.(
    id,
    name === folderName ? null : name,
    userRenamed
  ).catch(() => {
    // Non-fatal: the name still applies for this run, it just won't survive.
  })
}

/** Turn on sidebar-layout persistence. Call once on launch after the previous
 *  layout has been loaded (and groups restored), so re-adoption writes can't
 *  overwrite the saved file before we read it. */
export function enableSidebarPersistence(): void {
  sidebarPersistEnabled = true
  const { groups, displayOrder } = useSessionStore.getState()
  persistSidebarLayout(groups, displayOrder)
}

type SidebarSnapshot = {
  groups: SessionGroup[]
  displayOrder: string[]
  selectedSessionIds: string[]
  focusedSessionId: string | null
}

const MAX_SIDEBAR_UNDO = 50

function cloneGroupsForSnapshot(groups: SessionGroup[]): SessionGroup[] {
  return groups.map((g) => ({
    ...g,
    sessionIds: [...g.sessionIds],
    terminals: g.terminals.map((t) => ({ ...t }))
  }))
}

function snapshotSidebar(state: {
  groups: SessionGroup[]
  sessions: Session[]
  displayOrder: string[]
  selectedSessionIds: string[]
  focusedSessionId: string | null
}): SidebarSnapshot {
  return {
    groups: cloneGroupsForSnapshot(state.groups),
    displayOrder: [...getDisplayOrder(state)],
    selectedSessionIds: [...state.selectedSessionIds],
    focusedSessionId: state.focusedSessionId
  }
}

function pushSidebarSnapshot(
  stack: SidebarSnapshot[],
  snap: SidebarSnapshot
): SidebarSnapshot[] {
  const next = stack.length >= MAX_SIDEBAR_UNDO ? stack.slice(stack.length - MAX_SIDEBAR_UNDO + 1) : stack.slice()
  next.push(snap)
  return next
}

/** Flattened, workspace-filtered session id order — the one list behind
 *  Cmd+1..9 and Cmd+Shift+]/[ session cycling. Groups expand to their member
 *  sessions; anything outside the active workspace is skipped; file tabs are
 *  not sessions and never cycle. */
export function getVisibleFlatOrder(
  state: { sessions: Session[]; groups: SessionGroup[]; displayOrder: string[] },
  activeId: string | null
): string[] {
  const flatIds: string[] = []
  for (const id of getDisplayOrder(state)) {
    const group = state.groups.find((g) => g.id === id)
    if (group) {
      if (!inActiveWorkspace(group, activeId)) continue
      flatIds.push(...group.sessionIds)
      continue
    }
    const session = state.sessions.find((s) => s.id === id)
    if (session && inActiveWorkspace(session, activeId)) flatIds.push(id)
  }
  return flatIds
}

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

export function fileTabDedupKey(tab: FileTab): string {
  if (tab.kind === 'diff' && tab.diff) {
    const suffix =
      tab.diff.type === 'working'
        ? `working-${tab.diff.staged ? 's' : 'u'}`
        : `commit-${tab.diff.hash ?? ''}`
    return `diff:${tab.diff.cwd}:${tab.diff.file}:${suffix}`
  }
  return `file:${tab.filePath}`
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  fileTabs: [],
  focusedSessionId: null,
  selectedSessionIds: [],
  groups: [],
  displayOrder: [],
  activeGroupViewId: null,
  sidebarOpen: true,
  sidebarWidth: 260,
  theme: (localStorage.getItem('clave-theme') as Theme) || 'light',
  appIcon: (localStorage.getItem('clave-app-icon') as AppIcon) || 'dark',
  tmuxMode: localStorage.getItem('clave-tmux-mode') !== 'false',
  searchQuery: '',
  claudeMode: true,
  antigravityMode: false,
  codexMode: false,
  claudeAgentsMode: false,
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
  settingsSection: 'general' as SettingsSection,
  extensionsSection: 'marketplaces' as ExtensionsSection,
  sidePanelTab: 'files' as const,
  gitViewMode: (localStorage.getItem('clave-git-view-mode') === 'tree' ? 'tree' : 'list') as 'list' | 'tree',
  gitPanelMode: 'changes' as const,
  gitShowCommitBar: localStorage.getItem('clave-git-commit-bar') === 'show',
  gitLivePollLimit: (() => {
    const raw = Number(localStorage.getItem('clave-git-live-poll-limit'))
    return Number.isFinite(raw) && raw > 0 ? raw : 50
  })(),
  gitLivePollAlways: localStorage.getItem('clave-git-live-poll-always') === 'true',
  journeyPanel: null,
  commitMessages: {} as Record<string, string>,
  generatingCommitCwds: new Set<string>(),
  hiddenAgentIds: new Set<string>(
    JSON.parse(localStorage.getItem('clave-hidden-agent-ids') || '[]')
  ),
  sidebarUndoStack: [] as SidebarSnapshot[],
  workspaceSelections: {},
  applyWorkspaceSwitch: (fromId, toId) =>
    set((state) => {
      const workspaceSelections = { ...state.workspaceSelections }
      if (fromId) {
        workspaceSelections[fromId] = {
          selectedSessionIds: state.selectedSessionIds,
          focusedSessionId: state.focusedSessionId
        }
      }
      // Restore the target's saved selection, validated against live sessions;
      // fall back to the first visible session; else an empty selection.
      const visibleIds = new Set(
        state.sessions.filter((s) => inActiveWorkspace(s, toId)).map((s) => s.id)
      )
      const saved = toId ? workspaceSelections[toId] : undefined
      let selectedSessionIds = (saved?.selectedSessionIds ?? []).filter((id) => visibleIds.has(id))
      if (selectedSessionIds.length === 0) {
        const first = state.sessions.find((s) => inActiveWorkspace(s, toId))
        selectedSessionIds = first ? [first.id] : []
      }
      const focusedSessionId =
        saved?.focusedSessionId && visibleIds.has(saved.focusedSessionId)
          ? saved.focusedSessionId
          : selectedSessionIds[0] ?? null
      return { workspaceSelections, selectedSessionIds, focusedSessionId }
    }),
  addSession: (session) =>
    set((state) => {
      // Central workspace stamp: callers with a specific home pass it (pin
      // launches, MCP caller inheritance, adoption, duplicate/resume); everyone
      // else inherits the active workspace. Mirrors the pty:spawn-side default.
      const workspaceId = session.workspaceId ?? useWorkspaceStore.getState().activeWorkspaceId ?? undefined
      const newSession = { ...session, workspaceId, antigravityMode: session.antigravityMode ?? false, codexMode: session.codexMode ?? false, claudeAgentsMode: session.claudeAgentsMode ?? false, detectedUrl: session.detectedUrl ?? null, serverStatus: session.serverStatus ?? null, serverCommand: session.serverCommand ?? null, hasUnseenActivity: session.hasUnseenActivity ?? false, userRenamed: session.userRenamed ?? false, planFilePath: session.planFilePath ?? null }

      // A spawn into a HIDDEN workspace (MCP background work) must not steal
      // the user's view: the sidebar already filters the tab out, so grabbing
      // selection/focus here would show its terminal pane over the active
      // workspace's world. Only visible spawns take focus.
      const visible = inActiveWorkspace(newSession, useWorkspaceStore.getState().activeWorkspaceId)
      const focusPatch = visible
        ? {
            selectedSessionIds: [session.id],
            focusedSessionId: session.id,
            activeView: 'terminals' as const
          }
        : {}

      // Check if selected sessions all belong to a single group
      const selectedIds = state.selectedSessionIds
      let targetGroup: SessionGroup | undefined
      if (selectedIds.length > 0) {
        const group = state.groups.find((g) =>
          selectedIds.every((sid) => g.sessionIds.includes(sid))
        )
        // Never auto-nest across workspaces: a hidden-workspace spawn (MCP)
        // must not land inside the visible selection's group.
        if (group && (group.workspaceId ?? undefined) === workspaceId) targetGroup = group
      }

      if (targetGroup) {
        // Add session inside the selected group
        return {
          sessions: [...state.sessions, newSession],
          ...focusPatch,
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
        ...focusPatch,
        displayOrder: [...getDisplayOrder(state), session.id]
      }
    }),

  resetSessions: async () => {
    const { sessions, groups } = useSessionStore.getState()

    // The one app-initiated close: every tab goes, recorded as such. (An app
    // QUIT is not a close — sessions survive in tmux and are re-adopted.)
    for (const s of sessions) emitTabClosed(s, groups, 'app', null)

    // Kill all PTYs
    await Promise.allSettled(
      sessions.map((s) => window.electronAPI?.killSession(s.id).catch(() => {}))
    )

    set({
      sessions: [],
      groups: [],
      displayOrder: [],
      focusedSessionId: null,
      selectedSessionIds: [],
      searchQuery: ''
    })
  },

  restoreGroups: (survivingSessionIds, persisted) =>
    set((state) => {
      const persistedGroups = persisted?.groups ?? []
      if (persistedGroups.length === 0) return state

      const surviving = new Set(survivingSessionIds)

      // Prune each group to the sessions/terminals that actually came back.
      // A group whose members all vanished is dropped (it would render empty).
      const groups: SessionGroup[] = []
      for (const g of persistedGroups) {
        const sessionIds = (g.sessionIds ?? []).filter((sid) => surviving.has(sid))
        if (sessionIds.length === 0) continue
        const terminals = (g.terminals ?? []).map((t) =>
          t.sessionId && !surviving.has(t.sessionId) ? { ...t, sessionId: null } : t
        )
        // Legacy stamp: groups persisted before the workspace model inherit
        // their first surviving member's workspace (adoption stamped it).
        const memberWorkspaceId = state.sessions.find((s) => s.id === sessionIds[0])?.workspaceId
        groups.push({ ...g, sessionIds, terminals, workspaceId: g.workspaceId ?? memberWorkspaceId })
      }
      if (groups.length === 0) return state

      const keptGroupIds = new Set(groups.map((g) => g.id))
      // Sessions nested inside a kept group (as a member or a group terminal)
      // must not also appear at the top level of the display order.
      const nested = new Set<string>()
      for (const g of groups) {
        for (const sid of g.sessionIds) nested.add(sid)
        for (const t of g.terminals) if (t.sessionId) nested.add(t.sessionId)
      }

      // Rebuild displayOrder from the persisted order, dropping dead references.
      const order: string[] = []
      const seen = new Set<string>()
      for (const id of persisted?.displayOrder ?? []) {
        if (seen.has(id)) continue
        if (keptGroupIds.has(id)) {
          order.push(id)
          seen.add(id)
        } else if (surviving.has(id) && !nested.has(id)) {
          order.push(id)
          seen.add(id)
        }
      }
      // Append any surviving standalone session the persisted order missed,
      // then any kept group not yet placed (belt-and-suspenders).
      for (const s of state.sessions) {
        if (!seen.has(s.id) && !nested.has(s.id)) {
          order.push(s.id)
          seen.add(s.id)
        }
      }
      for (const g of groups) {
        if (!seen.has(g.id)) {
          order.push(g.id)
          seen.add(g.id)
        }
      }

      // Keep auto-generated group names ("Group N") from colliding with the
      // restored ones on the next createGroup.
      groupCounter = Math.max(groupCounter, groups.length)

      return { ...state, groups, displayOrder: order }
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

      // Fallback focus stays inside the active workspace — closing the last
      // visible tab must never silently focus a hidden workspace's session.
      const activeId = useWorkspaceStore.getState().activeWorkspaceId
      const visibleSessions = sessions.filter((s) => inActiveWorkspace(s, activeId))

      let focusedSessionId = state.focusedSessionId
      if (focusedSessionId === id) {
        focusedSessionId =
          selectedSessionIds[0] ?? visibleSessions[visibleSessions.length - 1]?.id ?? null
      }
      if (selectedSessionIds.length === 0 && visibleSessions.length > 0) {
        const lastId = visibleSessions[visibleSessions.length - 1].id
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
      // Clear unseen activity + the cross-tab injected marker when viewed
      const sessions = session?.hasUnseenActivity || session?.injectedFrom
        ? state.sessions.map((s) => s.id === id ? { ...s, hasUnseenActivity: false, injectedFrom: null } : s)
        : state.sessions
      if (addToSelection) {
        const isSelected = state.selectedSessionIds.includes(id)
        const newSelected = isSelected
          ? state.selectedSessionIds.filter((sid) => sid !== id)
          : [...state.selectedSessionIds, id]
        const focusedSessionId = isSelected ? (newSelected[0] ?? null) : id
        return { sessions, selectedSessionIds: newSelected, focusedSessionId, activeView: targetView, activeGroupViewId: null }
      }
      return { sessions, selectedSessionIds: [id], focusedSessionId: id, activeView: targetView, activeGroupViewId: null }
    }),

  selectSessions: (ids) =>
    set(() => ({
      selectedSessionIds: ids,
      focusedSessionId: ids[0] ?? null,
      activeView: 'terminals' as ActiveView,
      activeGroupViewId: null
    })),

  setFocusedSession: (id) => set(() => ({ focusedSessionId: id })),

  createGroup: (sessionIds, name?, workspaceId?) =>
    set((state) => {
      const sidebarUndoStack = pushSidebarSnapshot(state.sidebarUndoStack, snapshotSidebar(state))
      groupCounter++
      const groupName = name || `Group ${groupCounter}`
      const firstSession = state.sessions.find((s) => sessionIds.includes(s.id))
      const newGroup: SessionGroup = {
        id: `group-${Date.now()}-${groupCounter}`,
        name: groupName,
        sessionIds: [...sessionIds],
        collapsed: false,
        cwd: firstSession?.cwd ?? null,
        terminals: [],
        // Explicit stamp > first member's home > the active workspace.
        workspaceId:
          workspaceId ??
          firstSession?.workspaceId ??
          useWorkspaceStore.getState().activeWorkspaceId ??
          undefined
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

      return { groups: [...groups, newGroup], displayOrder, sidebarUndoStack }
    }),

  ungroupSessions: (groupId) =>
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return {}
      const sidebarUndoStack = pushSidebarSnapshot(state.sidebarUndoStack, snapshotSidebar(state))

      // Replace group ID in displayOrder with its session IDs
      const displayOrder = getDisplayOrder(state)
      const idx = displayOrder.indexOf(groupId)
      if (idx !== -1) {
        displayOrder.splice(idx, 1, ...group.sessionIds)
      }

      return {
        groups: state.groups.filter((g) => g.id !== groupId),
        displayOrder,
        sidebarUndoStack
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
    set((state) => {
      const target = state.groups.find((g) => g.id === groupId)
      const nextName = name.trim() || 'Group'
      if (!target || target.name === nextName) return {}
      const sidebarUndoStack = pushSidebarSnapshot(state.sidebarUndoStack, snapshotSidebar(state))
      return {
        groups: state.groups.map((g) => (g.id === groupId ? { ...g, name: nextName } : g)),
        sidebarUndoStack
      }
    }),

  toggleGroupCollapsed: (groupId) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
    })),

  setGroupView: (groupId, view) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, view } : g)),
      // Clearing a view that is currently showing drops back to the mosaic.
      ...(view === null && state.activeGroupViewId === groupId
        ? { activeGroupViewId: null }
        : {})
    })),

  setActiveGroupView: (groupId) => set(() => ({ activeGroupViewId: groupId })),

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

  setGroupPrompt: (groupId, prompt) =>
    set((state) => {
      const target = state.groups.find((g) => g.id === groupId)
      const next = prompt && prompt.trim() ? prompt : null
      if (!target || (target.prompt ?? null) === next) return {}
      const sidebarUndoStack = pushSidebarSnapshot(state.sidebarUndoStack, snapshotSidebar(state))
      return {
        groups: state.groups.map((g) => (g.id === groupId ? { ...g, prompt: next } : g)),
        sidebarUndoStack
      }
    }),

  setGroupColor: (groupId, color) =>
    set((state) => {
      const target = state.groups.find((g) => g.id === groupId)
      if (!target || target.color === color) return {}
      const sidebarUndoStack = pushSidebarSnapshot(state.sidebarUndoStack, snapshotSidebar(state))
      return {
        groups: state.groups.map((g) => (g.id === groupId ? { ...g, color } : g)),
        sidebarUndoStack
      }
    }),

  moveItems: (itemIds, targetId, position) =>
    set((state) => {
      const sidebarUndoStack = pushSidebarSnapshot(state.sidebarUndoStack, snapshotSidebar(state))
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

      return { displayOrder: finalDisplayOrder, groups: finalGroups, sidebarUndoStack }
    }),

  undoSidebar: () =>
    set((state) => {
      if (state.sidebarUndoStack.length === 0) return {}
      const snap = state.sidebarUndoStack[state.sidebarUndoStack.length - 1]
      const sidebarUndoStack = state.sidebarUndoStack.slice(0, -1)
      const validSessionIds = new Set(state.sessions.map((s) => s.id))
      const restoredGroups = snap.groups
        .map((g) => ({
          ...g,
          sessionIds: g.sessionIds.filter((sid) => validSessionIds.has(sid)),
          terminals: g.terminals.map((t) => ({
            ...t,
            sessionId: t.sessionId && validSessionIds.has(t.sessionId) ? t.sessionId : null
          }))
        }))
        .filter((g) => g.sessionIds.length > 0)
      const restoredGroupIds = new Set(restoredGroups.map((g) => g.id))
      const displayOrder = snap.displayOrder.filter(
        (id) => validSessionIds.has(id) || restoredGroupIds.has(id)
      )
      const focusedSessionId =
        snap.focusedSessionId && validSessionIds.has(snap.focusedSessionId)
          ? snap.focusedSessionId
          : state.focusedSessionId
      const selectedSessionIds = snap.selectedSessionIds.filter((sid) => validSessionIds.has(sid))
      return {
        groups: restoredGroups,
        displayOrder,
        focusedSessionId,
        selectedSessionIds: selectedSessionIds.length > 0 ? selectedSessionIds : state.selectedSessionIds,
        sidebarUndoStack
      }
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

  setTmuxMode: (tmuxMode) => {
    localStorage.setItem('clave-tmux-mode', String(tmuxMode))
    set({ tmuxMode })
    // Persist to the main process too: pty:spawn reads this as the default.
    window.electronAPI?.preferencesSet('tmuxMode', tmuxMode)
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

  setAgentState: (id, agentState) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id)
      if (!session || session.agentState === agentState) return state
      return {
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, agentState } : s))
      }
    }),

  setSessionPromptWaiting: (id, promptType) =>
    set((state) => {
      // Called on every PTY data chunk; bail when unchanged so we don't allocate
      // a new sessions array (and re-render every subscriber) tens of times/sec.
      const session = state.sessions.find((s) => s.id === id)
      if (!session || session.promptWaiting === promptType) return state
      return {
        sessions: state.sessions.map((s) =>
          s.id === id ? { ...s, promptWaiting: promptType } : s
        )
      }
    }),

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

  setSessionInjectedFrom: (id, from) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id)
      if (!session || (session.injectedFrom ?? null) === from) return state
      return {
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, injectedFrom: from } : s))
      }
    }),

  renameSession: (id, name) => {
    const session = useSessionStore.getState().sessions.find((s) => s.id === id)
    if (!session) return
    const next = name.trim() || session.folderName
    persistSessionName(id, next, session.folderName, true)
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name: next, userRenamed: true } : s
      )
    }))
  },

  autoRenameSession: (id, name) => {
    const session = useSessionStore.getState().sessions.find((s) => s.id === id)
    if (!session || session.userRenamed) return
    const next = name.trim() || session.name
    persistSessionName(id, next, session.folderName, false)
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, name: next } : s))
    }))
  },

  resetSessionName: (id) => {
    const session = useSessionStore.getState().sessions.find((s) => s.id === id)
    if (session) persistSessionName(id, session.folderName, session.folderName, false)
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name: s.folderName, userRenamed: false } : s
      )
    }))
  },

  setSessionPlanFile: (id, path) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, planFilePath: path } : s
      )
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleClaudeMode: () => set((state) => ({ claudeMode: !state.claudeMode })),

  toggleAntigravityMode: () => set((state) => ({ antigravityMode: !state.antigravityMode })),

  toggleCodexMode: () => set((state) => ({ codexMode: !state.codexMode })),

  toggleClaudeAgentsMode: () => set((state) => ({ claudeAgentsMode: !state.claudeAgentsMode })),

  toggleDangerousMode: () => set((state) => ({ dangerousMode: !state.dangerousMode })),

  toggleFilePalette: () => set((state) => ({ filePaletteOpen: !state.filePaletteOpen })),

  setFilePaletteOpen: (open) => set({ filePaletteOpen: open }),

  toggleFileTree: () => set((state) => ({ fileTreeOpen: !state.fileTreeOpen })),

  setFileTreeWidth: (width) => set({ fileTreeWidth: Math.max(180, Math.min(400, width)) }),

  setFileTreeWidthOverride: (width) => set({ fileTreeWidthOverride: width }),

  setActiveView: (view) => set({ activeView: view }),

  setSettingsSection: (section) => set({ settingsSection: section }),

  openSettings: (section) =>
    set((state) => ({
      activeView: 'settings',
      settingsSection: section ?? state.settingsSection
    })),

  setExtensionsSection: (section) => set({ extensionsSection: section }),

  openExtensions: (section) =>
    set((state) => ({
      activeView: 'extensions',
      extensionsSection: section ?? state.extensionsSection
    })),

  setSidePanelTab: (tab) => set({ sidePanelTab: tab }),

  setGitViewMode: (mode) => {
    localStorage.setItem('clave-git-view-mode', mode)
    set({ gitViewMode: mode })
  },

  setGitPanelMode: (mode) => set({ gitPanelMode: mode }),

  setGitShowCommitBar: (show) => {
    localStorage.setItem('clave-git-commit-bar', show ? 'show' : 'hide')
    set({ gitShowCommitBar: show })
  },

  setGitLivePollLimit: (limit) => {
    const clamped = Math.max(1, Math.round(limit))
    localStorage.setItem('clave-git-live-poll-limit', String(clamped))
    set({ gitLivePollLimit: clamped })
  },

  setGitLivePollAlways: (always) => {
    localStorage.setItem('clave-git-live-poll-always', String(always))
    set({ gitLivePollAlways: always })
  },

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
      const key = fileTabDedupKey(tab)
      const existing = state.fileTabs.find((f) => fileTabDedupKey(f) === key)
      if (existing) {
        return {
          // A re-open with an explicit view mode retargets the existing tab.
          ...(tab.view && tab.view !== existing.view
            ? {
                fileTabs: state.fileTabs.map((f) =>
                  f.id === existing.id ? { ...f, view: tab.view } : f
                )
              }
            : {}),
          selectedSessionIds: [existing.id],
          focusedSessionId: existing.id,
          activeView: 'terminals' as ActiveView,
          activeGroupViewId: null
        }
      }
      return {
        fileTabs: [...state.fileTabs, tab],
        displayOrder: [...getDisplayOrder(state), tab.id],
        selectedSessionIds: [tab.id],
        focusedSessionId: tab.id,
        activeView: 'terminals' as ActiveView,
        activeGroupViewId: null
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

  setFileTabDiffStaged: (id, staged) =>
    set((state) => ({
      fileTabs: state.fileTabs.map((f) =>
        f.id === id && f.diff ? { ...f, diff: { ...f.diff, staged } } : f
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
        antigravityMode: false,
        codexMode: false,
        claudeAgentsMode: false,
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

// Persist groups + sidebar ordering (via the main process) whenever either
// changes, so they survive an app restart. Sessions come back via tmux
// adoption; the saved layout is read on launch to rebuild the groups around the
// re-adopted sessions. Disabled until `enableSidebarPersistence()` runs so the
// empty initial state can't clobber the saved file before it's loaded.
useSessionStore.subscribe((state) => {
  if (!sidebarPersistEnabled) return
  if (state.groups !== lastPersistedGroups || state.displayOrder !== lastPersistedOrder) {
    persistSidebarLayout(state.groups, state.displayOrder)
  }
})
