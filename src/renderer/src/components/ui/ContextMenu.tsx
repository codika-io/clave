import { useEffect, useRef } from 'react'

interface ContextMenuItem {
  label: string
  onClick: () => void
  shortcut?: string
  disabled?: boolean
  icon?: React.ReactNode
  danger?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
}

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] py-1 bg-surface-100 border border-border rounded-lg shadow-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            if (!item.disabled) {
              item.onClick()
              onClose()
            }
          }}
          disabled={item.disabled}
          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-surface-200 disabled:opacity-40 disabled:cursor-default transition-colors ${item.danger ? 'text-red-400 hover:text-red-300' : 'text-text-primary'}`}
        >
          <span className="flex items-center gap-2">
            {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
            {item.label}
          </span>
          {item.shortcut && <span className="ml-4 text-text-tertiary">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  )
}
