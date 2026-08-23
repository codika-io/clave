import { emitTabClosed } from '../../lib/exchange-capture'
import { useEffect, useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore, isFileTabId, getVisibleFlatOrder, inActiveWorkspace, enableSidebarPersistence } from '../../store/session-store'
import type { SessionGroup, SettingsSection } from '../../store/session-store'
import { useAgentStore } from '../../store/agent-store'
import { Sidebar } from './Sidebar'
import { launchSession } from '../../lib/launch-session'
import { loadLaunchPrefs, type AgentSetup } from '../../store/launch-prefs'
import { TerminalGrid } from './TerminalGrid'
import { SettingsPanel } from '../settings/SettingsPanel'
import { SettingsSidebar } from '../settings/SettingsSidebar'
import { ExtensionsPanel } from '../extensions/ExtensionsPanel'
import { ExtensionsSidebar } from '../extensions/ExtensionsSidebar'
import { UpdateOverlay } from '../ui/UpdateOverlay'
import { connectUpdaterStore } from '../../store/updater-store'
import { MissionControlOverlay } from '../ui/MissionControlOverlay'
import { AgentChatPanel } from '../agents/AgentChatPanel'
import { useWorkTracker } from '../../store/work-tracker-store'
import { FilePalette } from '../files/FilePalette'
import { SidePanel } from '../git/SidePanel'
import { FilePreview } from '../files/FilePreview'
import { GitDiffPreview } from '../git/GitDiffPreview'
import { GitJourneyPanel } from '../git/GitJourneyPanel'
import { Bars3BottomLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'
import { usePinnedStore, initClaveFileWatchers } from '../../store/pinned-store'
import { useWorkspaceStore } from '../../store/workspace-store'
import { bootWorkspaces, refreshActiveWorkspacePins, cycleWorkspace } from '../../lib/workspace-actions'
import { promptRestore } from '../../store/restore-prompt-store'
import { RestorePromptDialog } from '../ui/RestorePromptDialog'
import { initMcpDispatcher } from '../../lib/mcp-dispatcher'
import { initSecretStore } from '../../store/secret-store'
import { initCopyOfferStore } from '../../store/copy-offer-store'
import { ToolbarSecretPopover } from './ToolbarSecretPopover'
import { ToolbarWorkspacePopover } from './ToolbarWorkspacePopover'
import { resolveColorHex } from '../../store/session-types'
import { getTerminalIconComponent } from '../ui/GroupCommandDialog'
import { ToolbarTerminalPopover } from './ToolbarTerminalPopover'

const sidebarTransition = {
  duration: 0.2,
  ease: [0.2, 0, 0, 1] as const
}

/** Process-wide latch so tmux-session adoption runs exactly once per launch,
 *  even across React StrictMode's mount→unmount→mount in development. */
let tmuxAdoptionStarted = false

/** Same latch pattern for the MCP command dispatcher: exactly one subscriber
 *  per process, or concurrent tool calls would get duplicate responses. */
let mcpDispatcherStarted = false

/** ⌘-key → what it launches. `null` is a plain terminal (no agent), which is
 *  why the lookup tests `!== undefined` rather than truthiness. */
const LAUNCH_SHORTCUTS: Record<string, AgentSetup | null> = {
  KeyT: null,
  KeyN: { kind: 'claude', dangerousMode: false },
  KeyD: { kind: 'claude', dangerousMode: true },
  KeyI: { kind: 'antigravity', dangerousMode: false },
  KeyU: { kind: 'codex', dangerousMode: false }
}

export function AppShell() {
  const sidebarOpen = useSessionStore((s) => s.sidebarOpen)
  const sidebarWidth = useSessionStore((s) => s.sidebarWidth)
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar)
  const setSidebarWidth = useSessionStore((s) => s.setSidebarWidth)
  const theme = useSessionStore((s) => s.theme)
  const toggleFilePalette = useSessionStore((s) => s.toggleFilePalette)
  const fileTreeOpen = useSessionStore((s) => s.fileTreeOpen)
  const fileTreeWidth = useSessionStore((s) => s.fileTreeWidth)
  const fileTreeWidthOverride = useSessionStore((s) => s.fileTreeWidthOverride)
  const toggleFileTree = useSessionStore((s) => s.toggleFileTree)
  const setFileTreeWidth = useSessionStore((s) => s.setFileTreeWidth)
  const activeView = useSessionStore((s) => s.activeView)
  const previewFile = useSessionStore((s) => s.previewFile)
  const previewSource = useSessionStore((s) => s.previewSource)

  const addSession = useSessionStore((s) => s.addSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const removeFileTab = useSessionStore((s) => s.removeFileTab)

  useWorkTracker()

  // Wire the in-app MCP command dispatcher and the secret-request store to
  // their main-process push channels. The module-level latch makes this run
  // exactly once per process even under React StrictMode's mount/remount, so
  // neither channel is double-subscribed. Both live for the process lifetime.
  useEffect(() => {
    if (mcpDispatcherStarted) return
    mcpDispatcherStarted = true
    initMcpDispatcher()
    initSecretStore()
    initCopyOfferStore()
    // What the agent button relaunches, per workspace. Deliberately NOT in the
    // session-adoption effect below: that one awaits the "restore sessions?"
    // prompt, so anything after it waits on the user answering a dialog — and
    // the launcher would show the wrong remembered agent until they did. The
    // map is keyed by workspace id and read at render time, so it does not care
    // whether it lands before or after the workspace registry.
    void loadLaunchPrefs()
  }, [])

  useEffect(() => {
    if (tmuxAdoptionStarted) return
    tmuxAdoptionStarted = true
    void (async () => {
      try {
        // Workspace registry + pins hydrate FIRST: adoption stamps each
        // surviving session against it, and unstamped survivors fall back to
        // the active workspace. (This is the single sequential boot owner —
        // the old lazy loadWorkspaces() in Sidebar raced this effect.)
        await bootWorkspaces()
        const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId

        // Read the previous run's saved groups BEFORE any session is adopted
        // (re-adoption mutates the layout). Then rebuild groups around the
        // survivors and only then turn persistence on, so the saved file is
        // never overwritten before we've loaded it.
        const savedLayout = await window.electronAPI?.sidebarLayoutLoad?.().catch(() => null)
        const persisted = {
          groups: (savedLayout?.groups ?? []) as SessionGroup[],
          displayOrder: savedLayout?.displayOrder ?? []
        }

        const survivors = (await window.electronAPI?.listSessionRecords?.()) ?? []

        /** Bring one record back as a tab. Live tmux survivors reattach; dead
         *  ones (plain, or tmux killed by a reboot) relaunch fresh in the same
         *  cwd, Claude resuming via claudeSessionId. */
        const adoptRecord = async (s: (typeof survivors)[number]): Promise<string | null> => {
          try {
            const workspaceId = s.workspaceId ?? activeWorkspaceId ?? undefined
            const info = await window.electronAPI.spawnSession(s.cwd, {
              claudeMode: s.claudeMode,
              antigravityMode: s.antigravityMode,
              codexMode: s.codexMode,
              claudeAgentsMode: s.claudeAgentsMode,
              dangerousMode: s.dangerousMode,
              model: s.model,
              // Live survivor: MUST go through tmux to reattach. Dead record:
              // fresh spawn under the current global tmux preference — the
              // name is still offered so a tmux respawn reuses it (spawn
              // handles record-key transitions either way).
              ...(s.live && s.tmuxName
                ? { tmuxMode: true, adoptTmuxName: s.tmuxName }
                : s.tmuxName
                  ? { adoptTmuxName: s.tmuxName }
                  : {}),
              // Reuse the original id so lifecycle-hook status routing keeps
              // working after the session comes back.
              adoptSessionId: s.id,
              // Live survivor (quit/reopen): reattach to the running process —
              // claudeSessionId only drives the header badge, the agent isn't
              // re-run. Dead record: re-spawn fresh, so pass resumeSessionId to
              // relaunch Claude with `--resume <id>` and reload the prior
              // conversation.
              ...(s.live
                ? { claudeSessionId: s.claudeSessionId }
                : s.claudeMode && s.claudeSessionId
                  ? { resumeSessionId: s.claudeSessionId }
                  : {}),
              // Carry the account/profile forward so the badge is restored.
              configDir: s.configDir,
              claudeProfileId: s.claudeProfileId,
              claudeProfileLabel: s.claudeProfileLabel,
              // Explicit stamp (record value or legacy inference) so the
              // rewritten record keeps the session's workspace, not the
              // active one at adoption time.
              workspaceId
            })
            addSession({
              id: info.id,
              cwd: info.cwd,
              folderName: info.folderName,
              // Restore the label the user last saw. `userRenamed` comes back
              // too, so an explicit rename keeps its immunity to auto-titling.
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
              // The attached web view comes back with the tab; its hidden
              // serving session did not survive, so the pane's probe shows
              // down with a one-click start (serverSessionId stays unset).
              view: s.view ? { ...s.view } : undefined
            })
            return info.id
          } catch (err) {
            console.error('Failed to adopt persistent session:', s.tmuxName ?? s.id, err)
            return null
          }
        }

        // Reattach = silent, relaunch = ask. Live tmux survivors were never
        // disrupted, so they come back unprompted (as always). Everything else
        // needs actual process launches on the user's behalf — gate those
        // behind the restore prompt, "Start fresh" discarding the records.
        const liveOnes = survivors.filter((s) => s.live)
        const deadOnes = survivors.filter((s) => !s.live)

        const adoptedIds: string[] = []
        for (const s of liveOnes) {
          const id = await adoptRecord(s)
          if (id) adoptedIds.push(id)
        }
        if (deadOnes.length > 0) {
          if (await promptRestore(deadOnes)) {
            for (const s of deadOnes) {
              const id = await adoptRecord(s)
              if (id) adoptedIds.push(id)
            }
          } else {
            for (const s of deadOnes) {
              void window.electronAPI?.discardSessionRecord?.(s.tmuxName ?? s.id)
            }
          }
        }

        // Rebuild the persisted groups around the sessions that came back.
        if (adoptedIds.length && persisted.groups.length) {
          useSessionStore.getState().restoreGroups(adoptedIds, persisted)
        }
      } catch (err) {
        console.error('Failed to restore sessions/groups on launch:', err)
      } finally {
        // Turn persistence on only now — after the saved layout was loaded and
        // groups restored — so adoption writes can't clobber the saved file.
        enableSidebarPersistence()
      }

      // Boot tail: land the initial selection in the active workspace, start
      // watching every file-backed pin (all workspaces — hidden ones stay
      // fresh), and refresh the active workspace's pins from its files.
      useSessionStore
        .getState()
        .applyWorkspaceSwitch(null, useWorkspaceStore.getState().activeWorkspaceId)
      initClaveFileWatchers()
      void refreshActiveWorkspacePins()
    })()
  }, [addSession])

  const sidebarRef = useRef<HTMLDivElement>(null)
  const fileTreeRef = useRef<HTMLDivElement>(null)
  const skipTransition = useRef(false)
  const [draggingLeft, setDraggingLeft] = useState(false)
  const [draggingRight, setDraggingRight] = useState(false)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDraggingLeft(true)
      skipTransition.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (ev: MouseEvent) => {
        const w = Math.max(180, Math.min(480, ev.clientX))
        if (sidebarRef.current) {
          sidebarRef.current.style.width = `${w}px`
        }
      }

      const onMouseUp = (ev: MouseEvent) => {
        const w = Math.max(180, Math.min(480, ev.clientX))
        setSidebarWidth(w)
        // Keep skipTransition true briefly so Framer doesn't animate to the committed value
        requestAnimationFrame(() => {
          skipTransition.current = false
        })
        setDraggingLeft(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [setSidebarWidth]
  )

  const handleTreeResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDraggingRight(true)
      skipTransition.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (ev: MouseEvent) => {
        const w = Math.max(180, Math.min(400, window.innerWidth - ev.clientX))
        if (fileTreeRef.current) {
          fileTreeRef.current.style.width = `${w}px`
        }
      }

      const onMouseUp = (ev: MouseEvent) => {
        const w = Math.max(180, Math.min(400, window.innerWidth - ev.clientX))
        setFileTreeWidth(w)
        requestAnimationFrame(() => {
          skipTransition.current = false
        })
        setDraggingRight(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [setFileTreeWidth]
  )

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'p') {
        e.preventDefault()
        toggleFilePalette()
      }
      if (e.metaKey && e.key === 'e') {
        e.preventDefault()
        toggleFileTree()
      }
      // Cmd+B: Toggle left sidebar
      if (e.metaKey && !e.shiftKey && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
      // Cmd+Shift+G: Open right sidebar with Git tab
      if (e.metaKey && e.shiftKey && e.key === 'g') {
        e.preventDefault()
        const state = useSessionStore.getState()
        if (state.fileTreeOpen && state.sidePanelTab === 'git') {
          toggleFileTree()
        } else {
          if (!state.fileTreeOpen) toggleFileTree()
          useSessionStore.getState().setSidePanelTab('git')
        }
      }
      // Cmd+? (Cmd+Shift+/) — open help panel
      if (e.metaKey && e.shiftKey && e.key === '/') {
        e.preventDefault()
        const { fileTreeOpen: helpFileTreeOpen, toggleFileTree: helpToggleFileTree, sidePanelTab, setSidePanelTab } =
          useSessionStore.getState()
        if (helpFileTreeOpen && sidePanelTab === 'help') {
          helpToggleFileTree()
        } else {
          if (!helpFileTreeOpen) helpToggleFileTree()
          setSidePanelTab('help')
        }
        return
      }
      // New-session shortcuts. They start at the WORKSPACE ROOT — the folder
      // dialog is no longer on the common path — and Option is the escape hatch
      // that asks where: ⌘N launches at the root, ⌥⌘N opens the picker.
      //
      // Matched on e.code, not e.key: Option rewrites e.key on macOS (⌥N is a
      // dead key producing '˜'), so an e.key match would never fire with Option
      // held. e.code loses the implicit "Shift makes it uppercase" guard the old
      // lowercase comparisons had, so !e.shiftKey is now explicit.
      if (e.metaKey && !e.shiftKey && LAUNCH_SHORTCUTS[e.code] !== undefined) {
        e.preventDefault()
        void launchSession({
          setup: LAUNCH_SHORTCUTS[e.code],
          cwd: e.altKey ? { kind: 'ask' } : { kind: 'workspace-root' },
          remember: LAUNCH_SHORTCUTS[e.code] !== null
        })
      }
      // Cmd+Shift+A: New Claude Agents session (`claude agents`)
      if (e.metaKey && e.shiftKey && e.code === 'KeyA') {
        e.preventDefault()
        void launchSession({
          setup: { kind: 'claude-agents', dangerousMode: false },
          cwd: e.altKey ? { kind: 'ask' } : { kind: 'workspace-root' },
          remember: true
        })
      }
      // Cmd+W: Close focused file tab
      if (e.metaKey && e.key === 'w') {
        const sid = useSessionStore.getState().focusedSessionId
        if (sid && isFileTabId(sid)) {
          e.preventDefault()
          removeFileTab(sid)
        }
      }
      // Cmd+Delete: Close focused session
      if (e.metaKey && e.key === 'Backspace') {
        e.preventDefault()
        const sid = useSessionStore.getState().focusedSessionId
        if (sid) {
          if (isFileTabId(sid)) {
            removeFileTab(sid)
          } else {
            const current = useSessionStore.getState()
            const closing = current.sessions.find((s) => s.id === sid)
            if (closing) emitTabClosed(closing, current.groups, 'user', null)
            window.electronAPI.killSession(sid).catch(() => {})
            removeSession(sid)
          }
        }
      }
      // Cmd+,: Open settings
      if (e.metaKey && e.key === ',') {
        e.preventDefault()
        useSessionStore.getState().setActiveView('settings')
      }
      // Cmd+F: Focus sidebar search (open sidebar if closed)
      if (e.metaKey && !e.shiftKey && e.key === 'f') {
        e.preventDefault()
        const state = useSessionStore.getState()
        if (!state.sidebarOpen) state.toggleSidebar()
        // Small delay to let sidebar mount before focusing
        setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>('[data-sidebar-search]')
          input?.focus()
        }, 50)
      }
      // Cmd+Ctrl+] / Cmd+Ctrl+[: cycle the active workspace
      if (e.metaKey && e.ctrlKey && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        cycleWorkspace(e.key === ']' ? 1 : -1)
        return
      }
      // Cmd+1-9: Switch to session by index (within the active workspace)
      if (e.metaKey && !e.shiftKey && !e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const state = useSessionStore.getState()
        const flatIds = getVisibleFlatOrder(state, useWorkspaceStore.getState().activeWorkspaceId)
        const idx = parseInt(e.key) - 1
        if (idx < flatIds.length) {
          state.selectSession(flatIds[idx], false)
        }
      }
      // Cmd+Shift+] / Cmd+Shift+[: Next / previous session (active workspace)
      if (e.metaKey && e.shiftKey && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        const state = useSessionStore.getState()
        const flatIds = getVisibleFlatOrder(state, useWorkspaceStore.getState().activeWorkspaceId)
        if (flatIds.length === 0) return
        const currentIdx = flatIds.indexOf(state.focusedSessionId ?? '')
        let nextIdx: number
        if (e.key === ']') {
          nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % flatIds.length
        } else {
          nextIdx = currentIdx < 0 ? flatIds.length - 1 : (currentIdx - 1 + flatIds.length) % flatIds.length
        }
        state.selectSession(flatIds[nextIdx], false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleFilePalette, toggleFileTree, toggleSidebar, removeSession, removeFileTab])

  // Sync data-theme attribute to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Updater: subscribe to main's state and pull the current truth on mount.
  // The pull is the point — a push-only updater loses the "an update exists"
  // fact for 30 minutes if the renderer was not listening when it fired.
  useEffect(() => connectUpdaterStore(), [])

  // Open Settings → Updates when asked from the native menu.
  useEffect(() => {
    if (!window.electronAPI?.onOpenSettingsSection) return
    return window.electronAPI.onOpenSettingsSection((section) => {
      useSessionStore.getState().openSettings(section as SettingsSection)
    })
  }, [])

  // Handle notification click → switch to session
  useEffect(() => {
    if (!window.electronAPI?.onNotificationClicked) return
    return window.electronAPI.onNotificationClicked((sessionId) => {
      useSessionStore.getState().selectSession(sessionId, false)
    })
  }, [])

  // Handle SSH connection closed → mark remote sessions as ended
  useEffect(() => {
    if (!window.electronAPI?.onSshConnectionClosed) return
    return window.electronAPI.onSshConnectionClosed((locationId) => {
      useSessionStore.setState((state) => {
        const remoteSessions = state.sessions.filter(
          (s) => s.locationId === locationId && (s.sessionType === 'remote-terminal' || s.sessionType === 'remote-claude')
        )
        if (remoteSessions.length === 0) return {}
        return {
          sessions: state.sessions.map((s) =>
            s.locationId === locationId && (s.sessionType === 'remote-terminal' || s.sessionType === 'remote-claude')
              ? { ...s, alive: false, activityStatus: 'ended' as const }
              : s
          )
        }
      })
    })
  }, [])

  // Sync agent STATUS updates to existing agent sessions in the sidebar.
  // Does NOT auto-add agents — only the picker adds agents to the sidebar.
  // Only updates sessions array when status actually changed to avoid unnecessary re-renders.
  const syncAgentStatus = useCallback((locationId: string, typedAgents: import('../../../../shared/remote-types').Agent[]) => {
    useSessionStore.setState((state) => {
      const currentAgentSessions = state.sessions.filter(
        (s) => s.sessionType === 'agent' && s.locationId === locationId
      )
      if (currentAgentSessions.length === 0) return {}

      const incomingMap = new Map(typedAgents.map((a) => [a.id, a]))
      const updates: Array<{ sessionId: string; alive: boolean; activityStatus: import('../../store/session-types').ActivityStatus; cwd?: string }> = []

      for (const session of currentAgentSessions) {
        if (!session.agentId) continue
        const agent = incomingMap.get(session.agentId)
        if (agent) {
          const alive = agent.status !== 'offline'
          const activityStatus: import('../../store/session-types').ActivityStatus =
            agent.status === 'busy' ? 'active' : agent.status === 'offline' ? 'ended' : 'idle'
          const cwd = agent.cwd
          if (session.alive !== alive || session.activityStatus !== activityStatus || (cwd && session.cwd !== cwd)) {
            updates.push({ sessionId: session.id, alive, activityStatus, cwd })
          }
        } else {
          // Agent disappeared — mark offline if not already
          if (session.alive || session.activityStatus !== 'ended') {
            updates.push({ sessionId: session.id, alive: false, activityStatus: 'ended' })
          }
        }
      }

      if (updates.length === 0) return {}

      const updateMap = new Map(updates.map((u) => [u.sessionId, u]))
      return {
        sessions: state.sessions.map((s) => {
          const update = updateMap.get(s.id)
          return update ? { ...s, alive: update.alive, activityStatus: update.activityStatus, ...(update.cwd ? { cwd: update.cwd } : {}) } : s
        })
      }
    })
  }, [])

  // Subscribe to agent updates from OpenClaw connections
  useEffect(() => {
    if (!window.electronAPI?.onAgentsUpdated) return
    return window.electronAPI.onAgentsUpdated((locationId, agents) => {
      const typedAgents = agents as import('../../../../shared/remote-types').Agent[]
      useAgentStore.getState().setAgents(locationId, typedAgents)
      // Load conversation history for newly discovered agents
      const agentIds = typedAgents.map((a) => a.id)
      if (agentIds.length > 0) {
        useAgentStore.getState().loadHistory(locationId, agentIds)
      }
      syncAgentStatus(locationId, typedAgents)
    })
  }, [syncAgentStatus])

  // One-time status sync: if agent sessions already exist and agents are loaded,
  // update their status (e.g., after HMR or window reload)
  useEffect(() => {
    const agentState = useAgentStore.getState()
    if (agentState.agents.length > 0) {
      const byLocation = new Map<string, import('../../../../shared/remote-types').Agent[]>()
      for (const agent of agentState.agents) {
        const list = byLocation.get(agent.locationId) || []
        list.push(agent)
        byLocation.set(agent.locationId, list)
      }
      for (const [locationId, agents] of byLocation) {
        syncAgentStatus(locationId, agents)
      }
    }
  }, [syncAgentStatus])

  const effectiveFileTreeWidth = fileTreeWidthOverride ?? fileTreeWidth

  return (
    <div className="flex h-screen w-screen bg-surface-50 overflow-hidden transition-colors duration-200">
      {/* Title bar drag region — covers the full background area */}
      <div
        className="absolute inset-x-0 top-0 h-12 z-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Left sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            ref={sidebarRef}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: sidebarWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={skipTransition.current ? { duration: 0 } : sidebarTransition}
            className="flex-shrink-0 overflow-hidden relative z-10"
          >
            {/* Settings mode swaps in its own navigation sidebar */}
            {activeView === 'settings' ? (
              <SettingsSidebar />
            ) : activeView === 'extensions' ? (
              <ExtensionsSidebar />
            ) : (
              <Sidebar />
            )}
            {/* Resize handle — wide invisible hit area, thin visible line */}
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 right-0 w-2.5 h-full cursor-col-resize z-10 group/resize"
            >
              <div className={cn(
                'absolute top-0 right-0 h-full transition-colors border-r border-border/20',
                draggingLeft ? 'bg-accent' : 'group-hover/resize:bg-accent/50'
              )} style={{ width: '1.5px' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inset main content — transparent flex container for floating boxes */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0 my-2 gap-2 z-10 transition-[margin] duration-200',
        sidebarOpen ? 'ml-1' : 'ml-2',
        fileTreeOpen ? 'mr-1' : 'mr-2'
      )}>
        {/* Toolbar — its own floating card. Its row height is a token because
            the sidebar derives from it: --content-top-offset, and with it the
            launcher panel's top edge, is measured off this bar. */}
        <div className="floating-card flex-shrink-0 !bg-surface-0/70">
          <div
            className={cn(
              'h-[var(--toolbar-row-h)] flex items-center justify-between px-0.5 flex-shrink-0',
              !sidebarOpen && 'pl-[4.75rem]'
            )}
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          >
            {/* Left — sidebar toggle */}
            <div
              className="flex items-center gap-2"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <button
                onClick={toggleSidebar}
                className="btn-icon btn-icon-sm"
                title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                <Bars3BottomLeftIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Center — active workspace, and the switcher behind it */}
            <ToolbarWorkspacePopover />

            {/* Right — quick actions + divider + search + file tree */}
            <div
              className="flex items-center gap-0.5 min-w-0"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <ToolbarQuickActions />
              <ToolbarSecretPopover />
              {/* File palette button */}
              <button
                onClick={toggleFilePalette}
                className="btn-icon btn-icon-sm flex-shrink-0"
                title="Search files (Cmd+P)"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
              </button>
              {/* File tree button */}
              <button
                onClick={toggleFileTree}
                className={cn(
                  'btn-icon btn-icon-sm flex-shrink-0',
                  fileTreeOpen && '!text-accent'
                )}
                title="File tree (Cmd+E)"
              >
                <Bars3BottomLeftIcon className="w-4 h-4 scale-x-[-1]" />
              </button>
            </div>
          </div>
        </div>

        {/* Non-terminal views — single floating card */}
        <div className={cn(
          'flex-1 min-h-0 floating-card',
          activeView === 'terminals' ? 'hidden' : 'flex'
        )}>
          <div className={activeView === 'settings' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <SettingsPanel />
          </div>
          <div className={activeView === 'agents' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <AgentChatPanel />
          </div>
          <div className={activeView === 'extensions' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <ExtensionsPanel />
          </div>
        </div>

        {/* Terminal grid — each terminal is its own floating card */}
        <div className={activeView === 'terminals' ? 'flex-1 flex min-h-0' : 'hidden'}>
          <TerminalGrid />
        </div>
      </div>

      {/* Right sidebar (file tree / git panel) — outside the card, mirrors left sidebar */}
      <AnimatePresence initial={false}>
        {fileTreeOpen && (
          <motion.div
            ref={fileTreeRef}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: effectiveFileTreeWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={skipTransition.current ? { duration: 0 } : sidebarTransition}
            className="flex-shrink-0 overflow-hidden relative z-[45]"
          >
            {/* Resize handle */}
            {/* Resize handle — wide invisible hit area, thin visible line */}
            <div
              onMouseDown={handleTreeResizeStart}
              className="absolute top-0 left-0 w-2.5 h-full cursor-col-resize z-10 group/resize"
            >
              <div className={cn(
                'absolute top-0 left-0 h-full transition-colors border-l border-border/20',
                draggingRight ? 'bg-accent' : 'group-hover/resize:bg-accent/50'
              )} style={{ width: '1.5px' }} />
            </div>
            <SidePanel />
          </motion.div>
        )}
      </AnimatePresence>

      <FilePalette />
      {previewFile && previewSource === 'tree' && <FilePreview />}
      <GitDiffPreview />
      <GitJourneyPanel />
      <UpdateOverlay />
      <MissionControlOverlay />
      <RestorePromptDialog />
    </div>
  )
}

function ToolbarQuickActions() {
  const pinnedGroups = usePinnedStore((s) => s.pinnedGroups)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [openId, setOpenId] = useState<string | null>(null)

  // Toolbar buttons of the ACTIVE workspace only — hidden workspaces' dev
  // servers keep running (their sessions live in the registry), the buttons
  // just come back when switching back.
  const toolbarPins = pinnedGroups.filter(
    (pg) => pg.toolbar && inActiveWorkspace(pg, activeWorkspaceId)
  )
  if (toolbarPins.length === 0) return null

  // Darken color for better toolbar contrast
  const darken = (hex: string | undefined): string | undefined => {
    if (!hex) return undefined
    // Mix with black at 30% to darken
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const f = 0.7
    return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`
  }

  return (
    <>
      {toolbarPins.map((pg, pgIdx) => (
        <div key={pg.id} className="flex items-center gap-0.5 flex-shrink-0">
          {pgIdx > 0 && (
            <div className="w-px h-3.5 bg-border-subtle mx-0.5" />
          )}
          {pg.terminals.map((t, i) => {
            const key = `${pg.id}-${i}`
            const IconComp = getTerminalIconComponent(t.icon)
            const colorHex = darken(resolveColorHex(t.color))
            return (
              <ToolbarTerminalPopover
                key={key}
                cwd={t.cwd || pg.cwd || '.'}
                registryKey={`${pg.id}:${i}`}
                command={t.command}
                // A declared serverUrl implies persistent: closing the popover
                // must never kill the server the click just asked to exist.
                persistent={t.persistent || !!t.serverUrl}
                serverUrl={t.serverUrl}
                open={openId === key}
                onOpenChange={(open) => setOpenId(open ? key : null)}
                header={<IconComp className="w-3.5 h-3.5 shrink-0" style={{ color: colorHex }} />}
              >
                {t.serverUrl
                  ? (api) => (
                      <button
                        onClick={(e) => {
                          if (e.altKey) api.openTerminalOnly()
                          else api.handleClick()
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          api.openTerminalOnly()
                        }}
                        className="relative p-1.5 rounded-lg hover:bg-surface-200 transition-colors"
                        style={{ color: colorHex }}
                        title={api.title}
                      >
                        <IconComp className="w-4 h-4" />
                        {api.state !== 'unknown' && (
                          <span
                            className={cn(
                              'absolute right-0.5 bottom-0.5 w-1.5 h-1.5 rounded-full',
                              api.state === 'up' && 'bg-emerald-500',
                              api.state === 'starting' && 'bg-amber-400 animate-pulse',
                              api.state === 'down' && 'bg-text-tertiary'
                            )}
                          />
                        )}
                      </button>
                    )
                  : (
                      <button
                        className="p-1.5 rounded-lg hover:bg-surface-200 transition-colors"
                        style={{ color: colorHex }}
                        title={t.command || 'Shell'}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    )}
              </ToolbarTerminalPopover>
            )
          })}
        </div>
      ))}
      <div className="w-px h-3.5 bg-border-subtle mx-0.5 flex-shrink-0" />
    </>
  )
}

