import { cn } from '../../lib/utils'
import { useSessionStore, type Session } from '../../store/session-store'
import { useLocationStore } from '../../store/location-store'
import { CommandLineIcon, BoltIcon } from '@heroicons/react/24/outline'
import { ClaudeLogo, GeminiLogo, CodexLogo, ClaudeVariantGlyph } from '../icons/cli-logos'
import { SidebarTabItem } from './SidebarTabItem'

function LocationBadge({ locationId }: { locationId: string }) {
  const location = useLocationStore((s) => s.locations.find((l) => l.id === locationId))
  if (!location || location.type !== 'remote') return null
  return (
    <span
      className="badge flex-shrink-0 bg-surface-100 text-text-tertiary truncate max-w-[120px]"
      title={location.name}
    >
      {location.name}
    </span>
  )
}

// Distinguish the Claude variants without touching the brand logo: a faint trailing
// glyph after the name marks `claude agents` (bolt) and skip-permissions (shield).
// Plain Claude Code stays unmarked as the baseline.
function getClaudeVariant(session: Session): 'agents' | 'skip' | null {
  if (session.sessionType === 'agent') return null
  if (session.claudeAgentsMode) return 'agents'
  if (session.claudeMode && session.dangerousMode) return 'skip'
  return null
}

function SessionIcon({ session }: { session: Session }) {
  // Provider sessions show their brand mark; plain terminals keep the terminal icon.
  // OpenClaw remote agents use the bolt. The local Claude variants share the Claude mark
  // (the trailing glyph tells them apart). Remote sessions reuse the same provider marks —
  // the location badge already signals "remote".
  const Icon = session.sessionType === 'agent'
    ? BoltIcon
    : session.geminiMode
      ? GeminiLogo
      : session.codexMode
        ? CodexLogo
        : (session.claudeMode || session.claudeAgentsMode)
          ? ClaudeLogo
          : CommandLineIcon

  // Tab status visuals are Claude Code only and complementary, not redundant:
  // the ICON color carries "is it running" and the DOT carries "does it need me".
  //   working → blue pulsing icon, no dot
  //   blocked → neutral icon, amber dot (waiting on a permission/selection prompt)
  //   done & unseen → neutral icon, green dot (finished while you were away; clears on view)
  //   idle / done-seen / empty → neutral icon, no dot
  //   ended → dimmed icon, no dot
  // Gemini/Codex/terminals/agents have no deterministic state signal, so they stay
  // fully neutral — no color, no dot (see ROADMAP.md).
  const isClaudeCode =
    session.claudeMode === true &&
    !session.claudeAgentsMode &&
    !session.geminiMode &&
    !session.codexMode &&
    session.sessionType === 'local'

  const state = !session.alive ? 'ended' : session.agentState ?? 'idle'
  const working = isClaudeCode && state === 'working'
  const blocked = isClaudeCode && state === 'blocked'
  const doneUnseen = isClaudeCode && state === 'done' && session.hasUnseenActivity
  const ended = isClaudeCode && state === 'ended'

  const dotColor = blocked ? 'bg-status-waiting' : doneUnseen ? 'bg-status-ready' : null

  return (
    <span
      className="sidebar-tab-icon relative flex-shrink-0"
      style={working ? { animation: 'pulse-dot 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : undefined}
    >
      <Icon
        className={cn(
          'transition-colors duration-300',
          working && 'text-status-working',
          ended && 'text-text-tertiary opacity-50'
        )}
      />
      {dotColor && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-50',
            dotColor
          )}
        />
      )}
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
          : getClaudeVariant(session)
            ? <ClaudeVariantGlyph variant={getClaudeVariant(session)!} />
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
