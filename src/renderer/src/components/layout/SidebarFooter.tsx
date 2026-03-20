import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ChevronUpDownIcon,
  Cog6ToothIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { useUserStore, getInitials } from '../../store/user-store'
import { useSessionStore, type ActiveView } from '../../store/session-store'
import { cn } from '../../lib/utils'

function FooterPopover({ onClose }: { onClose: () => void }) {
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const activeView = useSessionStore((s) => s.activeView)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const items: { view: ActiveView; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string }[] = [
    { view: 'usage', icon: ChartBarIcon, label: 'Usage' },
    { view: 'settings', icon: Cog6ToothIcon, label: 'Settings' }
  ]

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-2 right-2 mb-1.5 rounded-xl bg-surface-100 border border-border-subtle shadow-lg overflow-hidden z-50"
    >
      <div className="py-1">
        {items.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => {
              setActiveView(view)
              onClose()
            }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors',
              activeView === view
                ? 'bg-surface-200 text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-200/50'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SidebarFooter() {
  const name = useUserStore((s) => s.name)
  const avatarPath = useUserStore((s) => s.avatarPath)
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => setOpen(false), [])

  const initials = getInitials(name)

  return (
    <div className="relative flex-shrink-0 px-2 pb-2 pt-1.5">
      {open && <FooterPopover onClose={close} />}
      <button
        onClick={toggle}
        className={cn(
          'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors',
          open
            ? 'bg-surface-200 text-text-primary'
            : 'hover:bg-surface-100 text-text-primary'
        )}
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {avatarPath ? (
            <img
              src={`file://${avatarPath}`}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs font-semibold text-text-secondary">
              {initials}
            </span>
          )}
        </div>
        {/* Name */}
        <div className="flex-1 text-left min-w-0">
          <span className="text-[13px] font-semibold truncate block">{name}</span>
        </div>
        {/* Chevron */}
        <ChevronUpDownIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
      </button>
    </div>
  )
}
