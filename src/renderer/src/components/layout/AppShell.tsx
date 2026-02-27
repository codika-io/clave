import { useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../store/session-store'
import { Sidebar } from './Sidebar'
import { TerminalGrid } from './TerminalGrid'
import { KanbanBoard } from '../board/KanbanBoard'
import { UsagePanel } from '../usage/UsagePanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { UpdateToast } from '../ui/UpdateToast'
import { UpdateOverlay } from '../ui/UpdateOverlay'
import { useLaunchTemplate } from '../../hooks/use-launch-template'
import { FilePalette } from '../files/FilePalette'
import { SidePanel } from '../git/SidePanel'
import { FilePreview } from '../files/FilePreview'
import { Bars3BottomLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'

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
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const removeSession = useSessionStore((s) => s.removeSession)

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
          dangerousMode
        })
      } catch (err) {
        console.error('Failed to create session:', err)
      }
    },
    [addSession]
  )

  const isResizing = useRef(false)
  const isResizingTree = useRef(false)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizing.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return
        setSidebarWidth(ev.clientX)
      }

      const onMouseUp = () => {
        isResizing.current = false
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
      isResizingTree.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizingTree.current) return
        setFileTreeWidth(window.innerWidth - ev.clientX)
      }

      const onMouseUp = () => {
        isResizingTree.current = false
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
      // Cmd+Delete: Close focused session
      if (e.metaKey && e.key === 'Backspace') {
        e.preventDefault()
        const sid = useSessionStore.getState().focusedSessionId
        if (sid) {
          window.electronAPI.killSession(sid).catch(() => {})
          removeSession(sid)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleFilePalette, toggleFileTree, spawnSessionWithOptions, removeSession])

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

  return (
    <div className="flex h-screen w-screen bg-surface-0 overflow-hidden transition-colors duration-200">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: sidebarWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={sidebarTransition}
            className="flex-shrink-0 overflow-hidden relative"
          >
            <Sidebar />
            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent-primary/40 active:bg-accent-primary/60 transition-colors z-10"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div
          className={`h-12 flex items-center justify-between px-4 border-b border-border-subtle flex-shrink-0 ${!sidebarOpen ? 'pl-20' : ''}`}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-md hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors"
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
              className="p-1.5 rounded-md hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors"
              title="Search files (Cmd+P)"
            >
              <MagnifyingGlassIcon className="w-4 h-4" />
            </button>
            {/* File tree button */}
            <button
              onClick={toggleFileTree}
              className={`p-1.5 rounded-md hover:bg-surface-200 transition-colors ${
                fileTreeOpen ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
              }`}
              title="File tree (Cmd+E)"
            >
              <Bars3BottomLeftIcon className="w-4 h-4 scale-x-[-1]" />
            </button>
          </div>
        </div>

        {/* Main content: both views always mounted, toggled via display */}
        <div className="flex-1 flex min-h-0">
          {/* Board view — hidden but stays mounted */}
          <div className={activeView === 'board' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <KanbanBoard />
          </div>

          {/* Usage view — hidden but stays mounted */}
          <div className={activeView === 'usage' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <UsagePanel />
          </div>

          {/* Settings view */}
          <div className={activeView === 'settings' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <SettingsPanel />
          </div>

          {/* Terminal grid + file tree — hidden but stays mounted */}
          <div className={activeView === 'terminals' ? 'flex-1 flex min-h-0' : 'hidden'}>
            <TerminalGrid />
            <AnimatePresence initial={false}>
              {fileTreeOpen && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: fileTreeWidthOverride ?? fileTreeWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={sidebarTransition}
                  className="flex-shrink-0 overflow-hidden relative"
                >
                  {/* Resize handle */}
                  <div
                    onMouseDown={handleTreeResizeStart}
                    className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors z-10"
                  />
                  <SidePanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <FilePalette />
      {previewFile && previewSource === 'tree' && <FilePreview />}
      <UpdateToast />
      <UpdateOverlay />
    </div>
  )
}
