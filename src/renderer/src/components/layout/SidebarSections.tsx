import { ChevronRightIcon, ViewColumnsIcon, ChartBarIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useSessionStore, type ActiveView } from '../../store/session-store'
import { useBoardStore } from '../../store/board-store'
import { cn } from '../../lib/utils'

export function SectionHeading({
  title,
  collapsed,
  onToggle
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-4 pt-4 pb-1.5 flex-shrink-0"
    >
      <ChevronRightIcon
        className={cn(
          'w-3 h-3 text-text-tertiary transition-transform duration-150',
          collapsed ? 'rotate-0' : 'rotate-90'
        )}
      />
      <span className="text-xs font-medium text-text-tertiary">{title}</span>
    </button>
  )
}

function WorkspaceButton({
  view,
  icon: Icon,
  label,
  badge
}: {
  view: ActiveView
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  badge?: number
}) {
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)

  return (
    <button
      onClick={() => setActiveView(view)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        activeView === view
          ? 'bg-surface-200 text-text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-100'
      )}
    >
      <Icon className="flex-shrink-0 w-5 h-5 text-text-tertiary" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
          {badge}
        </span>
      )}
    </button>
  )
}

export function WorkspaceSection({ collapsed }: { collapsed: boolean }) {
  const tasks = useBoardStore((s) => s.tasks)
  const nonDoneCount = tasks.filter((t) => t.status !== 'done').length

  if (collapsed) return null

  return (
    <div className="px-2 pt-0.5 flex-shrink-0">
      <WorkspaceButton view="board" icon={ViewColumnsIcon} label="Board" badge={nonDoneCount} />
      <WorkspaceButton view="usage" icon={ChartBarIcon} label="Usage" />
      <WorkspaceButton view="settings" icon={Cog6ToothIcon} label="Settings" />
    </div>
  )
}
