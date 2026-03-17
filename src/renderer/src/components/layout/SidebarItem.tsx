import { cn } from '../../lib/utils'

interface SidebarItemProps {
  icon: React.ReactNode
  label: string
  isSelected: boolean
  onClick: () => void
  rightContent?: React.ReactNode
  className?: string
}

export function SidebarItem({
  icon,
  label,
  isSelected,
  onClick,
  rightContent,
  className
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
        isSelected
          ? 'bg-surface-200 text-text-primary shadow-[0_0_0.5px_rgba(0,0,0,0.12)]'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-100',
        className
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {rightContent && <span className="ml-auto">{rightContent}</span>}
    </button>
  )
}
