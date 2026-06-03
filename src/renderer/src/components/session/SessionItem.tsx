import { cn } from '../../lib/utils'
import { useSessionStore, type Session } from '../../store/session-store'
import { useLocationStore } from '../../store/location-store'
import { CommandLineIcon, BoltIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { ClaudeLogo, GeminiLogo, CodexLogo } from '../icons/cli-logos'
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

function SessionIcon({ session }: { session: Session }) {
  const iconClass = cn('transition-colors duration-300', session.hasUnseenActivity && 'text-accent')

  // Provider sessions show their brand mark (Claude for both normal and skip-permissions
  // modes); plain terminals keep the terminal icon. Agents and remote sessions are special.
  const Icon = session.sessionType === 'agent'
    ? BoltIcon
    : session.sessionType === 'remote-terminal' || session.sessionType === 'remote-claude'
      ? GlobeAltIcon
      : session.geminiMode
        ? GeminiLogo
        : session.codexMode
          ? CodexLogo
          : session.claudeMode
            ? ClaudeLogo
            : CommandLineIcon

  return (
    <span className="sidebar-tab-icon relative flex-shrink-0">
      <Icon className={iconClass} />
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-surface-50',
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
  dimmed?: boolean
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
  dimmed,
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
      dimmed={dimmed}
      forceEditing={forceEditing}
      onEditingDone={onEditingDone}
      onPointerDown={onPointerDown}
      isDragging={isDragging}
    />
  )
}
