import { ChevronRightIcon, ViewColumnsIcon, ChartBarIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useSessionStore, type ActiveView } from '../../store/session-store'
import { useAgentStore } from '../../store/agent-store'
import { useLocationStore } from '../../store/location-store'
import { useBoardStore } from '../../store/board-store'
import { cn } from '../../lib/utils'

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
        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
        activeView === view
          ? 'bg-surface-200 text-text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-100'
      )}
    >
      <Icon className="flex-shrink-0 w-4 h-4 text-text-tertiary" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[12px] text-text-tertiary">
          {badge}
        </span>
      )}
    </button>
  )
}

const agentStatusColors: Record<string, string> = {
  online: 'bg-green-500',
  offline: 'bg-gray-400',
  busy: 'bg-amber-500',
  error: 'bg-red-500'
}

function AgentItem({
  agent,
  isActive,
  onClick
}: {
  agent: { id: string; name: string; status: string; locationId: string }
  isActive: boolean
  onClick: () => void
}) {
  const location = useLocationStore((s) => s.locations.find((l) => l.id === agent.locationId))

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors',
        isActive
          ? 'bg-surface-200 text-text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-100'
      )}
    >
      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', agentStatusColors[agent.status] || 'bg-gray-400')} />
      <span className="truncate">{agent.name}</span>
      {location && location.type === 'remote' && (
        <span className="ml-auto text-[12px] text-text-tertiary truncate max-w-[60px]">
          {location.name}
        </span>
      )}
    </button>
  )
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
    <div className="px-2 pt-0.5 overflow-y-auto max-h-[30vh] flex-shrink-0">
      {agents.map((agent) => (
        <AgentItem
          key={agent.id}
          agent={agent}
          isActive={activeAgentId === agent.id}
          onClick={() => {
            setActiveAgent(agent.id)
            setActiveView('agents')
          }}
        />
      ))}
    </div>
  )
}

export function WorkspaceSection({ collapsed }: { collapsed: boolean }) {
  const tasks = useBoardStore((s) => s.tasks)
  const nonDoneCount = tasks.filter((t) => t.status !== 'done').length

  if (collapsed) return null

  return (
    <div className="px-2 pt-0.5 space-y-0.5 flex-shrink-0">
      <WorkspaceButton view="board" icon={ViewColumnsIcon} label="Board" badge={nonDoneCount} />
      <WorkspaceButton view="usage" icon={ChartBarIcon} label="Usage" />
      <WorkspaceButton view="settings" icon={Cog6ToothIcon} label="Settings" />
    </div>
  )
}
