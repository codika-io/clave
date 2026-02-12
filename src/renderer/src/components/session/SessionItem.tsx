import { cn, shortenPath } from '../../lib/utils'
import type { Session } from '../../store/session-store'

interface SessionItemProps {
  session: Session
  isActive: boolean
  onClick: () => void
}

export function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
        isActive ? 'bg-surface-200 text-text-primary' : 'text-text-secondary hover:bg-surface-100'
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          session.alive ? 'bg-status-active' : 'bg-status-inactive'
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{session.folderName}</div>
        <div className="text-xs text-text-tertiary truncate">{shortenPath(session.cwd)}</div>
      </div>
    </button>
  )
}
