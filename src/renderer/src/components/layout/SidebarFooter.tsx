import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronUpDownIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline'
import { useUserStore } from '../../store/user-store'
import { useSessionStore, type ActiveView } from '../../store/session-store'
import { useUpdaterStore } from '../../store/updater-store'
import { cn } from '../../lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { UserIconDisplay } from '../ui/UserIconDisplay'

export function UpdateBanner() {
  const phase = useUpdaterStore((s) => s.phase)
  const version = useUpdaterStore((s) => s.version)
  const dismissed = useUpdaterStore((s) => s.dismissed)
  const setAvailable = useUpdaterStore((s) => s.setAvailable)
  const setDownloading = useUpdaterStore((s) => s.setDownloading)
  const dismiss = useUpdaterStore((s) => s.dismiss)

  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable) return
    return window.electronAPI.onUpdateAvailable((v) => {
      setAvailable(v)
    })
  }, [setAvailable])

  const handleUpdate = () => {
    setDownloading()
    window.electronAPI?.startDownload()
  }

  const showUpdateBanner = phase === 'available' && !dismissed

  return (
    <AnimatePresence>
      {showUpdateBanner && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-accent/8 border border-accent/15">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-accent/12 flex-shrink-0">
              <ArrowDownTrayIcon className="w-3.5 h-3.5 text-accent" />
            </div>
            <p className="text-[12px] font-medium text-text-primary leading-tight">
              {version ? `v${version}` : 'Update'}
            </p>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={dismiss}
                className="px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary hover:text-text-secondary rounded-md hover:bg-surface-200 transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleUpdate}
                className="px-2 py-0.5 text-[11px] font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
              >
                Update
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function SidebarFooter() {
  const name = useUserStore((s) => s.name)
  const avatarIcon = useUserStore((s) => s.avatarIcon)
  const avatarColor = useUserStore((s) => s.avatarColor)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const activeView = useSessionStore((s) => s.activeView)

  const phase = useUpdaterStore((s) => s.phase)
  const version = useUpdaterStore((s) => s.version)
  const dismissed = useUpdaterStore((s) => s.dismissed)
  const undismiss = useUpdaterStore((s) => s.undismiss)

  const [popoverOpen, setPopoverOpen] = useState(false)

  const showUpdateDot = dismissed && version !== null && phase === 'available'

  const items: { view: ActiveView; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string }[] = [
    { view: 'usage', icon: ChartBarIcon, label: 'Usage' },
    { view: 'settings', icon: Cog6ToothIcon, label: 'Settings' }
  ]

  return (
    <div className="relative">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors',
              'hover:bg-surface-100 text-text-primary data-[state=open]:bg-surface-200'
            )}
          >
            <div className="relative">
              <UserIconDisplay icon={avatarIcon} color={avatarColor} size="sm" />
              {/* Update dot indicator when dismissed */}
              {showUpdateDot && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    undismiss()
                  }}
                />
              )}
            </div>
            <div className="flex-1 text-left min-w-0">
              <span className="text-[13px] font-semibold truncate block">{name}</span>
            </div>
            <ChevronUpDownIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          animated
          open={popoverOpen}
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
                onClick={() => {
                  setActiveView(view)
                  setPopoverOpen(false)
                }}
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

          {/* Update option in popover when dismissed */}
          {showUpdateDot && (
            <>
              <div className="-mx-1.5 my-1.5 h-px bg-border-subtle" />
              <button
                onClick={() => {
                  undismiss()
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors cursor-default select-none text-accent hover:bg-surface-200"
              >
                <ArrowDownTrayIcon className="w-4 h-4 flex-shrink-0" />
                <span>Update available</span>
                <span className="ml-auto text-[11px] text-text-tertiary">{version ? `v${version}` : ''}</span>
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
