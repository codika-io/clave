import { FolderIcon, CommandLineIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { useSessionStore } from '../../store/session-store'
import { cn } from '../../lib/utils'
import type { BoardTask, BoardColumn } from '../../../../preload/index.d'
import { TagPill } from './TagPill'
import { useBoardStore } from '../../store/board-store'

function shortenCwd(cwd: string): string {
  const parts = cwd.split('/')
  if (parts.length <= 3) return cwd
  return '~/' + parts.slice(-2).join('/')
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface KanbanCardProps {
  task: BoardTask
  column: BoardColumn
  onRun: (task: BoardTask) => void
  onClick: (task: BoardTask) => void
  onContextMenu: (e: React.MouseEvent, task: BoardTask) => void
  onViewSession?: (sessionId: string) => void
  isDragging?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
}

export function KanbanCard({
  task,
  column,
  onRun,
  onClick,
  onContextMenu,
  onViewSession,
  isDragging,
  onPointerDown
}: KanbanCardProps) {
  const boardTags = useBoardStore((s) => s.tags)
  const linkedSession = useSessionStore((s) =>
    task.sessionId ? s.sessions.find((sess) => sess.id === task.sessionId) : undefined
  )

  const sessionAlive = useSessionStore((s) => {
    if (!task.sessionId) return false
    const sess = s.sessions.find((ss) => ss.id === task.sessionId)
    return sess?.alive === true
  })
  const activityStatus = useSessionStore((s) => {
    if (!task.sessionId) return null
    const sess = s.sessions.find((ss) => ss.id === task.sessionId)
    return sess?.activityStatus ?? null
  })
  const promptWaiting = useSessionStore((s) => {
    if (!task.sessionId) return null
    const sess = s.sessions.find((ss) => ss.id === task.sessionId)
    return sess?.promptWaiting ?? null
  })
  const label = task.title || task.notes.split('\n')[0] || task.prompt.split('\n')[0] || 'Untitled'
  const canResume = linkedSession != null && !sessionAlive
  const canRun =
    column.behavior !== 'terminal' &&
    (column.behavior !== 'active' || !sessionAlive)
  const hasPrompt = task.prompt.trim().length > 0
  const notesPreview = task.notes.trim() ? task.notes.split('\n').slice(0, 2).join(' ') : null

  return (
    <div
      data-task-id={task.id}
      onClick={() => onClick(task)}
      onContextMenu={(e) => onContextMenu(e, task)}
      onPointerDown={onPointerDown}
      className={cn(
        'group rounded-lg border border-border-subtle bg-surface-100 p-3 cursor-default transition-all hover:border-border hover:shadow-sm',
        isDragging && 'opacity-40',
        sessionAlive && promptWaiting && 'border-amber-400/50 shadow-[0_0_8px_rgba(251,191,36,0.15)]'
      )}
    >
      {/* Title */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-primary truncate">{label}</span>
        {task.dangerousMode && (
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400">
            skip-perms
          </span>
        )}
      </div>

      {/* Notes preview */}
      {notesPreview && (
        <p className="mt-1 text-xs text-text-tertiary line-clamp-2">{notesPreview}</p>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {task.tags.map((tagName) => {
            const def = boardTags.find((t) => t.name === tagName)
            return (
              <TagPill
                key={tagName}
                name={tagName}
                color={def?.color ?? 'blue'}
              />
            )
          })}
        </div>
      )}

      {/* Metadata row */}
      <div className="flex items-center gap-2 mt-2">
        {hasPrompt && (
          <span className="flex items-center gap-1 text-[10px] text-accent/70" title="Has prompt">
            <CommandLineIcon className="w-3 h-3" />
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <FolderIcon className="w-3 h-3" />
          <span className="truncate max-w-[120px]" title={task.cwd}>
            {shortenCwd(task.cwd)}
          </span>
        </span>
        <span className="text-text-tertiary/30">·</span>
        <span className="text-[11px] text-text-tertiary">{formatDate(task.createdAt)}</span>
      </div>

      {/* Hover actions */}
      {canRun && (
        <div className="mt-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRun(task)
            }}
            className="h-6 px-2.5 rounded text-[11px] font-medium bg-green-500/10 hover:bg-green-500/20 text-green-500 transition-colors flex items-center gap-1"
          >
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
              <path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor" />
            </svg>
            {canResume ? 'Resume' : 'Run'}
          </button>
        </div>
      )}

      {/* Session indicator */}
      {task.sessionId && (
        <div className="mt-2 flex items-center gap-1.5">
          {sessionAlive && promptWaiting ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] text-amber-400 truncate">
                {promptWaiting === 'is asking for permission'
                  ? 'Needs permission'
                  : 'Waiting for input'}
              </span>
            </>
          ) : sessionAlive && activityStatus === 'active' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] text-green-400">Working</span>
            </>
          ) : sessionAlive && activityStatus === 'idle' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-[11px] text-blue-400">Idle</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
              <span className="text-[11px] text-text-tertiary">Session ended</span>
            </>
          )}
          {linkedSession && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewSession?.(task.sessionId!)
              }}
              className="ml-auto h-6 px-2 rounded text-[11px] font-medium bg-accent/10 hover:bg-accent/20 text-accent transition-colors flex items-center gap-1"
              title="View session"
            >
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              View
            </button>
          )}
        </div>
      )}
    </div>
  )
}
