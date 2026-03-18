import { useMemo } from 'react'
import { usePinnedStore, getPinnedState, togglePinnedGroup, type PinnedGroup } from '../../store/pinned-store'
import { resolveColorHex } from '../../store/session-types'
import { useSessionStore } from '../../store/session-store'

interface PinnedGroupsGridProps {
  collapsed: boolean
  onContextMenu: (e: React.MouseEvent, pinnedId: string) => void
}

function getGridColumns(count: number, sidebarWidth: number): string {
  if (count <= 0) return '1fr'
  if (count === 1) return '1fr'
  if (count === 2) return 'repeat(2, 1fr)'
  if (count === 3) return 'repeat(3, 1fr)'
  if (count === 4) return sidebarWidth < 240 ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'
  return 'repeat(3, 1fr)'
}

export function PinnedGroupsGrid({ collapsed, onContextMenu }: PinnedGroupsGridProps) {
  const pinnedGroups = usePinnedStore((s) => s.pinnedGroups)
  const sidebarWidth = useSessionStore((s) => s.sidebarWidth)
  const gridColumns = useMemo(() => getGridColumns(pinnedGroups.length, sidebarWidth), [pinnedGroups.length, sidebarWidth])

  return (
    <div
      className="grid transition-[grid-template-rows,opacity,transform] duration-250 ease-out flex-shrink-0"
      style={{
        gridTemplateRows: collapsed ? '0fr' : '1fr',
        opacity: collapsed ? 0 : 1,
        transform: collapsed ? 'translateY(-4px)' : 'translateY(0)'
      }}
    >
      <div className="overflow-hidden">
        <div className="px-2 pt-0.5 pb-1">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: gridColumns }}>
            {pinnedGroups.map((pg) => (
              <PinnedGroupButton
                key={pg.id}
                pinnedGroup={pg}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PinnedGroupButton({
  pinnedGroup,
  onContextMenu
}: {
  pinnedGroup: PinnedGroup
  onContextMenu: (e: React.MouseEvent, pinnedId: string) => void
}) {
  const state = getPinnedState(pinnedGroup)
  const colorHex = resolveColorHex(pinnedGroup.color)

  const handleClick = () => {
    togglePinnedGroup(pinnedGroup.id)
  }

  const bgStyle: React.CSSProperties = colorHex
    ? state === 'active-visible'
      ? { backgroundColor: `${colorHex}25`, borderColor: `${colorHex}40` }
      : state === 'active-hidden'
        ? { backgroundColor: `${colorHex}15`, borderColor: `${colorHex}20` }
        : { backgroundColor: `${colorHex}10`, borderColor: `${colorHex}15` }
    : {}

  return (
    <button
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e, pinnedGroup.id)
      }}
      className={`
        flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg
        border text-[12px] font-medium truncate transition-all duration-150
        ${state === 'active-visible'
          ? colorHex ? 'text-text-primary' : 'bg-accent/15 border-accent/30 text-text-primary'
          : state === 'active-hidden'
            ? colorHex ? 'text-text-secondary' : 'bg-surface-100 border-border-subtle text-text-secondary'
            : colorHex ? 'text-text-tertiary hover:text-text-secondary' : 'bg-surface-100/50 border-border-subtle text-text-tertiary hover:bg-surface-200 hover:text-text-secondary'
        }
      `}
      style={bgStyle}
    >
      <span className="truncate">{pinnedGroup.name}</span>
      {state === 'active-hidden' && (
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: colorHex || 'var(--accent)' }}
        />
      )}
    </button>
  )
}
