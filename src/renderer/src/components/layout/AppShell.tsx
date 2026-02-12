import { useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../store/session-store'
import { Sidebar } from './Sidebar'
import { TerminalGrid } from './TerminalGrid'
import { ThemeToggle } from '../ui/ThemeToggle'

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

  const isResizing = useRef(false)

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

  // Sync data-theme attribute to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect
                  x="1"
                  y="2"
                  width="14"
                  height="12"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <line x1="5.5" y1="2" x2="5.5" y2="14" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <ThemeToggle />
          </div>
        </div>

        {/* Terminal grid */}
        <TerminalGrid />
      </div>
    </div>
  )
}
