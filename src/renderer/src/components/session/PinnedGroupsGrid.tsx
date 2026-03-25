import { forwardRef, useCallback, useMemo, useState } from 'react'
import { usePinnedStore, getPinnedState, togglePinnedGroup, findPinnedByGroupId, importClaveFile, type PinnedGroup } from '../../store/pinned-store'
import { resolveColorHex } from '../../store/session-types'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { useSessionStore } from '../../store/session-store'
import { DocumentIcon } from '@heroicons/react/24/outline'

interface PinnedGroupsGridProps {
  collapsed: boolean
  onContextMenu: (e: React.MouseEvent, pinnedId: string) => void
  isOverPinnedZone?: boolean
  draggedGroupId?: string | null
  isFileDragOver?: boolean
}

function getGridColumns(count: number, sidebarWidth: number): string {
  if (count <= 0) return '1fr'
  if (count === 1) return '1fr'
  if (count === 2) return 'repeat(2, 1fr)'
  if (count === 3) return 'repeat(3, 1fr)'
  if (count === 4) return sidebarWidth < 240 ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'
  return 'repeat(3, 1fr)'
}

export const PinnedGroupsGrid = forwardRef<HTMLDivElement, PinnedGroupsGridProps>(
  function PinnedGroupsGrid({ collapsed, onContextMenu, isOverPinnedZone, draggedGroupId, isFileDragOver: isFileDragOverParent }, ref) {
    const allPinnedGroups = usePinnedStore((s) => s.pinnedGroups)
    const pinnedGroups = useMemo(() => allPinnedGroups.filter((pg) => !pg.toolbar), [allPinnedGroups])
    const sidebarWidth = useSessionStore((s) => s.sidebarWidth)
    const [isFileDragOverLocal, setIsFileDragOverLocal] = useState(false)
    const isFileDragOver = isFileDragOverParent || isFileDragOverLocal
    const [flashPinnedId, setFlashPinnedId] = useState<string | null>(null)

    // Check if the dragged group is already pinned
    const alreadyPinnedId = useMemo(() => {
      if (!draggedGroupId) return null
      const pg = findPinnedByGroupId(draggedGroupId)
      return pg?.id ?? null
    }, [draggedGroupId])

    // Show placeholder when dragging a group that isn't already pinned
    const showGroupPlaceholder = !!draggedGroupId && !alreadyPinnedId
    const showFilePlaceholder = isFileDragOver
    const totalCards = pinnedGroups.length + (showGroupPlaceholder || showFilePlaceholder ? 1 : 0)
    const gridColumns = useMemo(() => getGridColumns(totalCards, sidebarWidth), [totalCards, sidebarWidth])

    // Force expand when dragging a group or file over
    const effectiveCollapsed = collapsed && !draggedGroupId && !isFileDragOverParent && !isFileDragOverLocal

    // ── HTML5 file drop handlers (for .clave files from Finder) ──
    const handleDragOver = useCallback((e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsFileDragOverLocal(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      // Only leave if we're actually leaving the container (not entering a child)
      if (e.currentTarget.contains(e.relatedTarget as Node)) return
      setIsFileDragOverLocal(false)
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
      e.preventDefault()
      setIsFileDragOverLocal(false)

      const files = e.dataTransfer.files
      if (!files.length) return

      const file = files[0]
      const filePath = window.electronAPI?.getPathForFile(file)
      if (!filePath || !filePath.endsWith('.clave')) return

      const result = await importClaveFile(filePath)
      if (result?.alreadyExists) {
        // Flash the existing pin button to show it's already there
        setFlashPinnedId(result.pinnedId)
        setTimeout(() => setFlashPinnedId(null), 1500)
      }
    }, [])

    return (
      <div
        ref={ref}
        className="grid transition-[grid-template-rows,opacity,transform] duration-250 ease-out flex-shrink-0"
        style={{
          gridTemplateRows: effectiveCollapsed ? '0fr' : '1fr',
          opacity: effectiveCollapsed ? 0 : 1,
          transform: effectiveCollapsed ? 'translateY(-4px)' : 'translateY(0)'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="overflow-hidden">
          <div className="px-2 pt-0.5 pb-1">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: gridColumns }}>
              {pinnedGroups.map((pg) => (
                <PinnedGroupButton
                  key={pg.id}
                  pinnedGroup={pg}
                  onContextMenu={onContextMenu}
                  highlighted={isOverPinnedZone && pg.id === alreadyPinnedId}
                  flashing={pg.id === flashPinnedId}
                />
              ))}
              {showGroupPlaceholder && (
                <div className={`
                  flex items-center justify-center px-2 py-2 rounded-lg border-2 border-dashed
                  text-[12px] font-medium transition-all duration-150
                  ${isOverPinnedZone
                    ? 'border-accent/60 text-accent/80 bg-accent/10'
                    : 'border-border-subtle/60 text-text-tertiary/50'
                  }
                `}>
                  <span className="truncate">{isOverPinnedZone ? 'Drop to pin' : 'Pin'}</span>
                </div>
              )}
              {showFilePlaceholder && !showGroupPlaceholder && (
                <div className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border-2 border-dashed border-accent/60 text-accent/80 bg-accent/10 text-[12px] font-medium transition-all duration-150">
                  <DocumentIcon className="w-3.5 h-3.5" />
                  <span className="truncate">Drop .clave</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
)

function PinnedGroupButton({
  pinnedGroup,
  onContextMenu,
  highlighted,
  flashing
}: {
  pinnedGroup: PinnedGroup
  onContextMenu: (e: React.MouseEvent, pinnedId: string) => void
  highlighted?: boolean
  flashing?: boolean
}) {
  const state = getPinnedState(pinnedGroup)
  const colorHex = resolveColorHex(pinnedGroup.color)
  // const isFileBacked = !!pinnedGroup.filePath

  const handleClick = () => {
    togglePinnedGroup(pinnedGroup.id)
  }

  const bgStyle: React.CSSProperties = colorHex
    ? highlighted
      ? { backgroundColor: `${colorHex}40`, borderColor: `${colorHex}60` }
      : state === 'active-visible'
        ? { backgroundColor: `${colorHex}25`, borderColor: `${colorHex}40` }
        : state === 'active-hidden'
          ? { backgroundColor: `${colorHex}15`, borderColor: `${colorHex}20` }
          : { backgroundColor: `${colorHex}10`, borderColor: `${colorHex}15` }
    : {}

  const button = (
    <button
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e, pinnedGroup.id)
      }}
      className={`
        relative flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg
        border text-[12px] font-medium truncate transition-all duration-150
        ${flashing ? 'ring-2 ring-accent animate-pulse' : ''}
        ${highlighted
          ? colorHex ? 'text-text-primary ring-2 ring-accent/50' : 'bg-accent/25 border-accent/40 text-text-primary ring-2 ring-accent/50'
          : state === 'active-visible'
            ? colorHex ? 'text-text-primary' : 'bg-accent/15 border-accent/30 text-text-primary'
            : state === 'active-hidden'
              ? colorHex ? 'text-text-secondary' : 'bg-surface-100 border-border-subtle text-text-secondary'
              : colorHex ? 'text-text-tertiary hover:text-text-secondary' : 'bg-surface-100/50 border-border-subtle text-text-tertiary hover:bg-surface-200 hover:text-text-secondary'
        }
      `}
      style={bgStyle}
    >
      {pinnedGroup.logo ? (
        <img
          src={pinnedGroup.logo}
          alt=""
          className="w-7 h-7 rounded-sm object-contain flex-shrink-0"
        />
      ) : (
        <span className="truncate">{pinnedGroup.name}</span>
      )}
      {state === 'active-hidden' && !highlighted && (
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: colorHex || 'var(--accent)' }}
        />
      )}
    </button>
  )

  if (pinnedGroup.logo) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top">{pinnedGroup.name}</TooltipContent>
      </Tooltip>
    )
  }

  return button
}
