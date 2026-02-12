import { motion } from 'framer-motion'
import { useSessionStore } from '../../store/session-store'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { TerminalErrorBoundary } from '../terminal/TerminalErrorBoundary'
import { EmptyState } from '../ui/EmptyState'

const transition = {
  duration: 0.15,
  ease: [0.2, 0, 0, 1] as const
}

export function TerminalGrid() {
  const visibleSessionIds = useSessionStore((s) => s.visibleSessionIds)
  const layoutMode = useSessionStore((s) => s.layoutMode)
  const sessions = useSessionStore((s) => s.sessions)

  if (sessions.length === 0) {
    return <EmptyState />
  }

  const gridCols = layoutMode === 'single' ? 'grid-cols-1' : 'grid-cols-2'
  const gridRows =
    layoutMode === 'grid-4' && visibleSessionIds.length > 2 ? 'grid-rows-2' : 'grid-rows-1'

  return (
    <div className={`flex-1 grid ${gridCols} ${gridRows} gap-px bg-border-subtle overflow-hidden`}>
      {visibleSessionIds.map((id) => (
        <motion.div
          key={id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transition}
          className="min-h-0 min-w-0 h-full"
        >
          <TerminalErrorBoundary sessionId={id}>
            <TerminalPanel sessionId={id} />
          </TerminalErrorBoundary>
        </motion.div>
      ))}
    </div>
  )
}
