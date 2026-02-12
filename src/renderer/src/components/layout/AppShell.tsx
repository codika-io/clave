import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../store/session-store'
import { Sidebar } from './Sidebar'
import { TerminalGrid } from './TerminalGrid'
import { LayoutSwitcher } from '../ui/LayoutSwitcher'
import { ThemeToggle } from '../ui/ThemeToggle'

const sidebarTransition = {
  duration: 0.2,
  ease: [0.2, 0, 0, 1] as const
}

export function AppShell() {
  const sidebarOpen = useSessionStore((s) => s.sidebarOpen)
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar)
  const sessions = useSessionStore((s) => s.sessions)
  const theme = useSessionStore((s) => s.theme)

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
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={sidebarTransition}
            className="flex-shrink-0 overflow-hidden"
          >
            <Sidebar />
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
                <line
                  x1="5.5"
                  y1="2"
                  x2="5.5"
                  y2="14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </div>

          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {sessions.length > 0 && <LayoutSwitcher />}
            <ThemeToggle />
          </div>
        </div>

        {/* Terminal grid */}
        <TerminalGrid />
      </div>
    </div>
  )
}
