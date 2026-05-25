import { useState } from 'react'
import {
  ChevronRightIcon,
  QueueListIcon
} from '@heroicons/react/24/outline'
import { useSessionStore } from '../../store/session-store'
import { useBoardStore } from '../../store/board-store'
import { cn } from '../../lib/utils'

export function SectionHeading({
  title,
  onToggle,
  actions
}: {
  title: string
  /** When provided, the whole label toggles the section (no disclosure arrow). */
  onToggle?: () => void
  actions?: React.ReactNode
}) {
  // Label left-padding aligns with the leading icon of tab rows:
  // px-2 list container (0.5rem) + .sidebar-item padding (--sidebar-row-px).
  const label = <span className="text-[13px] font-medium text-text-tertiary">{title}</span>
  return (
    <div className="w-full flex items-center pl-[calc(0.5rem+var(--sidebar-row-px))] pr-3 pt-3.5 pb-1 flex-shrink-0">
      {onToggle ? (
        <button onClick={onToggle} className="text-left">{label}</button>
      ) : (
        label
      )}
      {actions && <div className="ml-auto flex items-center gap-0.5">{actions}</div>}
    </div>
  )
}

export function TaskQueueSection() {
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const tasks = useBoardStore((s) => s.tasks)
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      {/* Queue row — clickable to navigate, chevron to expand sub-items */}
      <button
        onClick={() => setActiveView('board')}
        data-selected={activeView === 'board' ? 'true' : undefined}
        className="sidebar-item"
      >
        <QueueListIcon className="sidebar-tab-icon flex-shrink-0" />
        <span className="truncate">Queue</span>
        {tasks.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
              className="btn-icon btn-icon-xs hover:bg-surface-300/50"
            >
              <ChevronRightIcon
                className={cn(
                  'w-3 h-3 text-text-tertiary transition-transform duration-150',
                  expanded ? 'rotate-90' : 'rotate-0'
                )}
              />
            </span>
          </span>
        )}
      </button>

      {/* Expanded sub-items: task list with vertical connecting line */}
      {expanded && tasks.length > 0 && (
        <div className="relative ml-[18px] mt-0.5">
          {/* Vertical connecting line */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border-subtle" />

          {tasks.map((task) => {
            const label = task.title || task.prompt
            return (
              <button
                key={task.id}
                onClick={() => setActiveView('board')}
                className="group relative w-full flex items-center gap-2 pl-4 pr-2 py-1 text-left rounded-r-md hover:bg-surface-100 transition-colors"
              >
                {/* Horizontal branch tick */}
                <div className="absolute left-0 top-1/2 w-2.5 h-px bg-border-subtle" />
                <span className="text-[12px] text-text-secondary truncate">{label}</span>
                {task.dangerousMode && (
                  <span className="flex-shrink-0 text-[9px] text-red-400 font-medium">
                    skip
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
