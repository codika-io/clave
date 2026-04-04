import { motion, AnimatePresence } from 'framer-motion'
import { useWorkTrackerStore } from '../../store/work-tracker-store'
import { WorkTrackerCollapsed } from './WorkTrackerCollapsed'
import { WorkTrackerExpanded } from './WorkTrackerExpanded'

export function WorkTracker() {
  const isExpanded = useWorkTrackerStore((s) => s.isExpanded)
  const todaySessionCount = useWorkTrackerStore((s) => s.todaySessionCount)

  // Don't render if no sessions have been tracked yet
  if (todaySessionCount === 0) return null

  return (
    <div className="flex-shrink-0 px-2 pb-1">
      <div className="rounded-xl border border-border-subtle bg-surface-50 overflow-hidden">
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="overflow-hidden"
            >
              <WorkTrackerExpanded />
            </motion.div>
          )}
        </AnimatePresence>
        <WorkTrackerCollapsed />
      </div>
    </div>
  )
}
