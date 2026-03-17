import { ChevronRightIcon, ViewColumnsIcon, ChartBarIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useSessionStore, type ActiveView } from '../../store/session-store'
import { useBoardStore } from '../../store/board-store'
import { cn } from '../../lib/utils'
import { SidebarItem } from './SidebarItem'

export function SectionHeading({
  title,
  collapsed,
  onToggle,
  actions
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  actions?: React.ReactNode
}) {
  return (
    <div className="w-full flex items-center gap-1.5 px-3 pt-3.5 pb-1 flex-shrink-0">
      <button onClick={onToggle} className="flex items-center gap-1.5">
        <ChevronRightIcon
          className={cn(
            'w-3 h-3 text-text-tertiary transition-transform duration-150',
            collapsed ? 'rotate-0' : 'rotate-90'
          )}
        />
        <span className="text-[13px] font-medium text-text-tertiary">{title}</span>
      </button>
      {actions && <div className="ml-auto flex items-center gap-0.5">{actions}</div>}
    </div>
  )
}

export function WorkspaceSection({ collapsed }: { collapsed: boolean }) {
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const tasks = useBoardStore((s) => s.tasks)
  const nonDoneCount = tasks.filter((t) => t.status !== 'done').length

  const items: { view: ActiveView; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string; badge?: number }[] = [
    { view: 'board', icon: ViewColumnsIcon, label: 'Board', badge: nonDoneCount },
    { view: 'usage', icon: ChartBarIcon, label: 'Usage' },
    { view: 'settings', icon: Cog6ToothIcon, label: 'Settings' }
  ]

  return (
    <div
      className="grid transition-[grid-template-rows,opacity,transform] duration-250 ease-out flex-shrink-0"
      style={{ gridTemplateRows: collapsed ? '0fr' : '1fr', opacity: collapsed ? 0 : 1, transform: collapsed ? 'translateY(-4px)' : 'translateY(0)' }}
    >
      <div className="overflow-hidden">
        <div className="px-2 pt-0.5 space-y-0.5">
          {items.map(({ view, icon: Icon, label, badge }) => (
            <SidebarItem
              key={view}
              icon={<Icon className="flex-shrink-0 w-4 h-4 text-text-tertiary" />}
              label={label}
              isSelected={activeView === view}
              onClick={() => setActiveView(view)}
              rightContent={
                badge !== undefined && badge > 0 ? (
                  <span className="text-[12px] text-text-tertiary">{badge}</span>
                ) : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}
