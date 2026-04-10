import { motion, AnimatePresence } from 'framer-motion'
import { useWorkTrackerStore } from '../../store/work-tracker-store'
import { WorkTrackerCollapsed } from './WorkTrackerCollapsed'
import { WorkTrackerExpanded } from './WorkTrackerExpanded'
import { cn } from '../../lib/utils'

export function WorkTracker() {
  const enabled = useWorkTrackerStore((s) => s.enabled)
  const isExpanded = useWorkTrackerStore((s) => s.isExpanded)
  const breakSuggestion = useWorkTrackerStore((s) => s.breakSuggestion)

  if (!enabled) return null

  return (
    <div className="flex-shrink-0 px-2 pb-1">
      <div
        className={cn(
          'rounded-xl border bg-surface-50 overflow-hidden',
          breakSuggestion === 'strong'
            ? 'border-wellbeing-strong-border'
            : breakSuggestion === 'gentle'
              ? 'border-wellbeing-gentle-border'
              : 'border-border-subtle'
        )}
      >
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
