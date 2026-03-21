import {
  ChevronUpDownIcon,
  Cog6ToothIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { useUserStore } from '../../store/user-store'
import { useSessionStore, type ActiveView } from '../../store/session-store'
import { cn } from '../../lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { UserIconDisplay } from '../ui/UserIconDisplay'

export function SidebarFooter() {
  const name = useUserStore((s) => s.name)
  const avatarIcon = useUserStore((s) => s.avatarIcon)
  const avatarColor = useUserStore((s) => s.avatarColor)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const activeView = useSessionStore((s) => s.activeView)

  const items: { view: ActiveView; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string }[] = [
    { view: 'usage', icon: ChartBarIcon, label: 'Usage' },
    { view: 'settings', icon: Cog6ToothIcon, label: 'Settings' }
  ]

  return (
    <div className="relative flex-shrink-0 px-2 pb-2 pt-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors',
              'hover:bg-surface-100 text-text-primary data-[state=open]:bg-surface-200'
            )}
          >
            <UserIconDisplay icon={avatarIcon} color={avatarColor} size="sm" />
            <div className="flex-1 text-left min-w-0">
              <span className="text-[13px] font-semibold truncate block">{name}</span>
            </div>
            <ChevronUpDownIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="end"
          sideOffset={0}
          alignOffset={6}
          className="min-w-[220px] p-1.5 shadow-md shadow-black/5"
        >
          {/* User header */}
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <UserIconDisplay icon={avatarIcon} color={avatarColor} size="sm" />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-semibold text-text-primary truncate block">{name}</span>
            </div>
          </div>

          <div className="-mx-1.5 my-1.5 h-px bg-border-subtle" />

          {/* Menu items */}
          <div className="space-y-0.5">
            {items.map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors cursor-default select-none',
                  activeView === view
                    ? 'bg-surface-200 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-200'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0 opacity-60" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
