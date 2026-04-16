import { cn } from '../../lib/utils'
import { useSessionStore, type Session } from '../../store/session-store'
import { useLocationStore } from '../../store/location-store'
import { CommandLineIcon, BoltIcon, GlobeAltIcon, SparklesIcon, FireIcon } from '@heroicons/react/24/outline'
import { SidebarTabItem } from './SidebarTabItem'

function LocationBadge({ locationId }: { locationId: string }) {
  const location = useLocationStore((s) => s.locations.find((l) => l.id === locationId))
  if (!location || location.type !== 'remote') return null
  return (
    <span className="badge flex-shrink-0 bg-surface-100 text-text-tertiary truncate max-w-[60px]">
      {location.name}
    </span>
  )
}

function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 65 65" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M57.865 29.011C52.865 26.859 48.49 23.906 44.74 20.157C40.99 16.407 38.037 12.031 35.885 7.031C35.059 5.115 34.395 3.146 33.886 1.126C33.72.466 33.128.001 32.448.001C31.767.001 31.175.466 31.009 1.126C30.5 3.146 29.836 5.113 29.01 7.031C26.858 12.031 23.905 16.407 20.156 20.157C16.406 23.906 12.03 26.859 7.03 29.011C5.114 29.837 3.144 30.501 1.125 31.01C.465 31.176 0 31.768 0 32.449C0 33.129.465 33.721 1.125 33.887C3.144 34.396 5.112 35.06 7.03 35.886C12.03 38.038 16.405 40.991 20.156 44.74C23.907 48.49 26.858 52.866 29.01 57.866C29.836 59.782 30.5 61.752 31.009 63.771C31.175 64.431 31.767 64.896 32.448 64.896C33.128 64.896 33.72 64.431 33.886 63.771C34.395 61.752 35.059 59.784 35.885 57.866C38.037 52.866 40.99 48.492 44.74 44.74C48.489 40.991 52.865 38.038 57.865 35.886C59.781 35.06 61.751 34.396 63.77 33.887C64.43 33.721 64.895 33.129 64.895 32.449C64.895 31.768 64.43 31.176 63.77 31.01C61.751 30.501 59.783 29.837 57.865 29.011Z"
        fill="currentColor"
      />
    </svg>
  )
}

function SessionIcon({ session }: { session: Session }) {
  const iconClass = cn('w-4 h-4 transition-colors duration-300', session.hasUnseenActivity ? 'text-accent' : 'text-text-tertiary')

  const Icon = session.sessionType === 'agent'
    ? BoltIcon
    : session.sessionType === 'remote-terminal' || session.sessionType === 'remote-claude'
      ? GlobeAltIcon
      : session.dangerousMode
        ? FireIcon
        : session.geminiMode
          ? GeminiIcon
          : session.claudeMode
            ? SparklesIcon
            : CommandLineIcon

  return (
    <span className="relative flex-shrink-0 w-4 h-4">
      <Icon className={iconClass} />
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-50',
          session.activityStatus === 'active' && 'bg-status-working',
          session.activityStatus === 'idle' && 'bg-status-ready',
          session.activityStatus === 'ended' && 'bg-status-inactive'
        )}
        style={session.activityStatus === 'active' ? { animation: 'pulse-dot 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : undefined}
      />
    </span>
  )
}

interface SessionItemProps {
  session: Session
  isSelected: boolean
  onClick: (modifiers: { metaKey: boolean; shiftKey: boolean }) => void
  onContextMenu: (e: React.MouseEvent) => void
  grouped?: boolean
  groupSelected?: boolean
  groupColorHex?: string
  forceEditing?: boolean
  onEditingDone?: () => void
  onPointerDown?: (e: React.PointerEvent) => void
  isDragging?: boolean
  onDelete?: () => void
}

export function SessionItem({
  session,
  isSelected,
  onClick,
  onContextMenu,
  grouped,
  groupSelected,
  groupColorHex,
  forceEditing,
  onEditingDone,
  onPointerDown,
  isDragging,
  onDelete
}: SessionItemProps) {
  const renameSession = useSessionStore((s) => s.renameSession)

  return (
    <SidebarTabItem
      id={session.id}
      name={session.name}
      title={session.cwd.replace(/^\/Users\/[^/]+/, '~')}
      isSelected={isSelected}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onRename={renameSession}
      onDelete={onDelete}
      icon={<SessionIcon session={session} />}
      extraContent={
        session.locationId && session.sessionType !== 'local'
          ? <LocationBadge locationId={session.locationId} />
          : undefined
      }
      grouped={grouped}
      groupSelected={groupSelected}
      groupColorHex={groupColorHex}
      forceEditing={forceEditing}
      onEditingDone={onEditingDone}
      onPointerDown={onPointerDown}
      isDragging={isDragging}
    />
  )
}
