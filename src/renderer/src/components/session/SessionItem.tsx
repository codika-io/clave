import { cn } from '../../lib/utils'
import { useSessionStore, type Session } from '../../store/session-store'
import { useLocationStore } from '../../store/location-store'
import { CommandLineIcon, BoltIcon, GlobeAltIcon, SparklesIcon, FireIcon } from '@heroicons/react/24/outline'
import { SidebarTabItem } from './SidebarTabItem'

function LocationBadge({ locationId }: { locationId: string }) {
  const location = useLocationStore((s) => s.locations.find((l) => l.id === locationId))
  if (!location || location.type !== 'remote') return null
  return (
    <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-text-tertiary bg-surface-100 truncate max-w-[60px]">
      {location.name}
    </span>
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
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  dropIndicator?: 'before' | 'after' | null
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
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dropIndicator,
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
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      dropIndicator={dropIndicator}
      isDragging={isDragging}
    />
  )
}
