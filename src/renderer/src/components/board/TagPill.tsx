import { XMarkIcon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'

const TAG_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue:   { bg: 'bg-blue-500/15',   text: 'text-blue-400'   },
  green:  { bg: 'bg-green-500/15',  text: 'text-green-400'  },
  amber:  { bg: 'bg-amber-500/15',  text: 'text-amber-400'  },
  red:    { bg: 'bg-red-500/15',    text: 'text-red-400'    },
  purple: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  pink:   { bg: 'bg-pink-500/15',   text: 'text-pink-400'   },
  cyan:   { bg: 'bg-cyan-500/15',   text: 'text-cyan-400'   },
  orange: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
}

const DEFAULT_COLOR = { bg: 'bg-surface-200', text: 'text-text-secondary' }

interface TagPillProps {
  name: string
  color: string
  size?: 'sm' | 'md'
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
}

export function TagPill({ name, color, size = 'sm', onRemove, onClick, active }: TagPillProps) {
  const colors = TAG_COLOR_MAP[color] ?? DEFAULT_COLOR

  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium transition-colors',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        colors.bg,
        colors.text,
        onClick && 'cursor-pointer hover:opacity-80',
        active && 'ring-1 ring-current'
      )}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="hover:opacity-60 transition-opacity"
        >
          <XMarkIcon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        </button>
      )}
    </span>
  )
}

export { TAG_COLOR_MAP }
