import { useEffect, useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore, isFileTabId } from '../../store/session-store'
import { useAgentStore } from '../../store/agent-store'
import { Sidebar } from './Sidebar'
import { TerminalGrid } from './TerminalGrid'
import { KanbanBoard } from '../board/KanbanBoard'
import { UsagePanel } from '../usage/UsagePanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { UpdateOverlay } from '../ui/UpdateOverlay'
import { AgentChatPanel } from '../agents/AgentChatPanel'
import { useLaunchTemplate } from '../../hooks/use-launch-template'
import { FilePalette } from '../files/FilePalette'
import { SidePanel } from '../git/SidePanel'
import { FilePreview } from '../files/FilePreview'
import { GitDiffPreview } from '../git/GitDiffPreview'
import { Bars3BottomLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'

const sidebarTransition = {
  duration: 0.2,
  ease: [0.2, 0, 0, 1] as const
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

  useLaunchTemplate()

  const spawnSessionWithOptions = useCallback(
    async (claudeMode: boolean, dangerousMode: boolean) => {
      try {
        const folderPath = await window.electronAPI.openFolderDialog()
        if (!folderPath) return

        const sessionInfo = await window.electronAPI.spawnSession(folderPath, {
          claudeMode,
          dangerousMode
        })
        addSession({
          id: sessionInfo.id,
          cwd: sessionInfo.cwd,
          folderName: sessionInfo.folderName,
          name: sessionInfo.folderName,
          alive: sessionInfo.alive,
          activityStatus: 'idle',
          promptWaiting: null,
          claudeMode,
          dangerousMode,
          claudeSessionId: sessionInfo.claudeSessionId,
          sessionType: 'local'
        })
      } catch (err) {
        console.error('Failed to create session:', err)
      }
    },
    [addSession]
  )

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
      // Cmd+T: New terminal session
      if (e.metaKey && e.key === 't') {
        e.preventDefault()
        spawnSessionWithOptions(false, false)
      }
      // Cmd+N: New Claude Code session
      if (e.metaKey && e.key === 'n') {
        e.preventDefault()
        spawnSessionWithOptions(true, false)
      }
      // Cmd+D: New Claude Code session with --dangerously-skip-permissions
      if (e.metaKey && e.key === 'd') {
        e.preventDefault()
        spawnSessionWithOptions(true, true)
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
            window.electronAPI.killSession(sid).catch(() => {})
            removeSession(sid)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleFilePalette, toggleFileTree, spawnSessionWithOptions, removeSession, removeFileTab])

  // Sync data-theme attribute to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

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
            <Sidebar />
            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              className={cn(
                'absolute top-0 right-0 w-1.5 h-full cursor-col-resize transition-colors z-10',
                draggingLeft
                  ? 'bg-accent-primary/60'
                  : 'hover:bg-accent-primary/40 active:bg-accent-primary/60'
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inset main content — transparent flex container for floating boxes */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0 my-2 gap-2 z-10 transition-[margin] duration-200',
        sidebarOpen ? 'ml-0' : 'ml-2',
        fileTreeOpen ? 'mr-0' : 'mr-2'
      )}>
        {/* Toolbar — its own floating card */}
        <div className="floating-card flex-shrink-0 !bg-surface-0/70">
          <div
            className={cn(
              'h-8 flex items-center justify-between px-0.5 flex-shrink-0',
              !sidebarOpen && 'pl-[5.5rem]'
            )}
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          >
            <div
              className="flex items-center gap-2"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-lg hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors"
                title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                <Bars3BottomLeftIcon className="w-4 h-4" />
              </button>
            </div>

            <div
              className="flex items-center gap-2"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {/* File palette button */}
              <button
                onClick={toggleFilePalette}
                className="p-1.5 rounded-lg hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors"
                title="Search files (Cmd+P)"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
              </button>
              {/* File tree button */}
              <button
                onClick={toggleFileTree}
                className={cn(
                  'p-1.5 rounded-lg hover:bg-surface-200 transition-colors',
                  fileTreeOpen ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
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
          <div className={activeView === 'board' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <KanbanBoard />
          </div>
          <div className={activeView === 'usage' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <UsagePanel />
          </div>
          <div className={activeView === 'settings' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <SettingsPanel />
          </div>
          <div className={activeView === 'agents' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <AgentChatPanel />
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
            className="flex-shrink-0 overflow-hidden relative z-10"
          >
            {/* Resize handle */}
            <div
              onMouseDown={handleTreeResizeStart}
              className={cn(
                'absolute top-0 left-0 w-1.5 h-full cursor-col-resize transition-colors z-10',
                draggingRight
                  ? 'bg-accent-primary/60'
                  : 'hover:bg-accent-primary/40 active:bg-accent-primary/60'
              )}
            />
            <SidePanel />
          </motion.div>
        )}
      </AnimatePresence>

      <FilePalette />
      {previewFile && previewSource === 'tree' && <FilePreview />}
      <GitDiffPreview />
      <UpdateOverlay />
    </div>
  )
}
