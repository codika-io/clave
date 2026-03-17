import { ChevronRightIcon, ViewColumnsIcon, ChartBarIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useSessionStore, type ActiveView } from '../../store/session-store'
import { useAgentStore } from '../../store/agent-store'
import { useLocationStore } from '../../store/location-store'
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

const agentStatusColors: Record<string, string> = {
  online: 'bg-green-500',
  offline: 'bg-gray-400',
  busy: 'bg-amber-500',
  error: 'bg-red-500'
}

export function AgentsSection({ collapsed }: { collapsed: boolean }) {
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)
  const setActiveView = useSessionStore((s) => s.setActiveView)

  if (collapsed) return null

  if (agents.length === 0) {
    return (
      <div className="px-3 py-1.5 flex-shrink-0">
        <p className="text-[13px] text-text-tertiary">No agents connected</p>
      </div>
    )
  }

  return (
    <div className="px-2 pt-0.5 space-y-0.5 overflow-y-auto max-h-[30vh] flex-shrink-0">
      {agents.map((agent) => {
        const location = useLocationStore.getState().locations.find((l) => l.id === agent.locationId)
        return (
          <SidebarItem
            key={agent.id}
            icon={
              <div
                className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  agentStatusColors[agent.status] || 'bg-gray-400'
                )}
              />
            }
            label={agent.name}
            isSelected={activeAgentId === agent.id}
            onClick={() => {
              setActiveAgent(agent.id)
              setActiveView('agents')
            }}
            rightContent={
              location && location.type === 'remote' ? (
                <span className="text-[12px] text-text-tertiary truncate max-w-[60px]">
                  {location.name}
                </span>
              ) : undefined
            }
          />
        )
      })}
    </div>
  )
}

export function WorkspaceSection({ collapsed }: { collapsed: boolean }) {
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const tasks = useBoardStore((s) => s.tasks)
  const nonDoneCount = tasks.filter((t) => t.status !== 'done').length

  if (collapsed) return null

  const items: { view: ActiveView; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string; badge?: number }[] = [
    { view: 'board', icon: ViewColumnsIcon, label: 'Board', badge: nonDoneCount },
    { view: 'usage', icon: ChartBarIcon, label: 'Usage' },
    { view: 'settings', icon: Cog6ToothIcon, label: 'Settings' }
  ]

  return (
    <div className="px-2 pt-0.5 space-y-0.5 flex-shrink-0">
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
  )
}
