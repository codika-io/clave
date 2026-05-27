import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePinnedStore, getPinnedState, togglePinnedGroup, importClaveFile, type PinnedGroup } from '../../store/pinned-store'
import { resolveColorHex } from '../../store/session-types'
import { useSessionStore } from '../../store/session-store'
import { cn } from '../../lib/utils'
import { DocumentIcon } from '@heroicons/react/24/outline'

// Gap, in px, between the sidebar/main divider and the popover's left edge.
// Kept in sync with the `sideOffset` used by the New Session and footer
// popovers (8px container padding + 8px gap) so all three line up.
const DIVIDER_GAP = 8

interface TemplatePickerPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onContextMenu: (e: React.MouseEvent, pinnedId: string) => void
}

export function TemplatePickerPopover({ anchorRef, onClose, onContextMenu }: TemplatePickerPopoverProps) {
  const allPinnedGroups = usePinnedStore((s) => s.pinnedGroups)
  const templates = useMemo(() => allPinnedGroups.filter((pg) => !pg.toolbar), [allPinnedGroups])
  const sidebarWidth = useSessionStore((s) => s.sidebarWidth)
  const menuRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const [flashPinnedId, setFlashPinnedId] = useState<string | null>(null)

  // Dismiss on outside-click / Escape. We listen on `pointerdown` in the
  // capture phase (not `mousedown`) so opening another popover closes this one:
  // Radix triggers call preventDefault() on pointerdown, which suppresses the
  // compatibility mousedown event, so a mousedown listener would never fire.
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, anchorRef])

  // Filter by name, then group by category (uncategorized first), matching PinnedGroupsGrid order
  const categorized = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates
    const categoryMap = new Map<string, PinnedGroup[]>()
    const uncategorized: PinnedGroup[] = []
    for (const pg of filtered) {
      if (pg.category) {
        const existing = categoryMap.get(pg.category)
        if (existing) existing.push(pg)
        else categoryMap.set(pg.category, [pg])
      } else {
        uncategorized.push(pg)
      }
    }
    const sorted = [...categoryMap.entries()].sort(([a], [b]) => a.localeCompare(b))
    const result: { category: string | null; groups: PinnedGroup[] }[] = []
    if (uncategorized.length > 0) result.push({ category: null, groups: uncategorized })
    for (const [cat, groups] of sorted) result.push({ category: cat, groups })
    return result
  }, [templates, query])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsFileDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsFileDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsFileDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const filePath = window.electronAPI?.getPathForFile(file)
    if (!filePath || !filePath.endsWith('.clave')) return
    const result = await importClaveFile(filePath)
    if (result?.alreadyExists) {
      setFlashPinnedId(result.pinnedId)
      setTimeout(() => setFlashPinnedId(null), 1500)
    }
  }, [])

  const rect = anchorRef.current?.getBoundingClientRect()
  const showSearch = templates.length > 5

  return createPortal(
    <div
      ref={menuRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="fixed z-50 w-[260px] max-h-[60vh] flex flex-col py-1 bg-surface-100 border border-border rounded-lg shadow-md shadow-black/5"
      style={{
        // Open beside the sidebar, just right of the divider — matching the
        // New Session and user-footer popovers.
        top: rect?.top ?? 0,
        left: sidebarWidth + DIVIDER_GAP
      }}
    >
      {showSearch && (
        <div className="px-1 pt-1 pb-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="input-compact w-full"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {templates.length === 0 ? (
          <p className="px-1 py-4 text-[12px] text-text-tertiary text-center">
            No templates yet.
            <br />
            Drag a group here or drop a <code className="text-text-secondary">.clave</code> file.
          </p>
        ) : categorized.length === 0 ? (
          <p className="px-1 py-4 text-[12px] text-text-tertiary text-center">No matching templates</p>
        ) : (
          categorized.map(({ category, groups }) => (
            <div key={category ?? '__uncategorized'} className="px-1 space-y-0.5">
              {category && (
                <div className="px-[var(--sidebar-row-px)] pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary/60 select-none">
                  {category}
                </div>
              )}
              {groups.map((pg) => (
                <TemplateRow
                  key={pg.id}
                  template={pg}
                  flashing={pg.id === flashPinnedId}
                  onContextMenu={onContextMenu}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <div className="mt-1 mx-1 pt-1.5 pb-0.5 flex items-center gap-1.5 px-[var(--sidebar-row-px)] border-t border-border-subtle text-[11px] text-text-tertiary/70">
        <DocumentIcon className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">
          {isFileDragOver ? 'Drop to add' : 'Drop a .clave file to add'}
        </span>
      </div>
    </div>,
    document.body
  )
}

function TemplateRow({
  template,
  flashing,
  onContextMenu
}: {
  template: PinnedGroup
  flashing: boolean
  onContextMenu: (e: React.MouseEvent, pinnedId: string) => void
}) {
  const state = getPinnedState(template)
  const colorHex = resolveColorHex(template.color)
  const dotColor = colorHex || 'var(--accent)'

  return (
    <button
      onClick={() => togglePinnedGroup(template.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e, template.id)
      }}
      data-selected={state === 'active-visible' ? 'true' : undefined}
      className={cn('sidebar-item sidebar-item--elevated group', flashing && 'ring-2 ring-accent animate-pulse')}
    >
      {template.logo ? (
        <img src={template.logo} alt="" className="w-4 h-4 rounded-sm object-contain flex-shrink-0" />
      ) : (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: state === 'idle' ? 'var(--border)' : dotColor }}
        />
      )}
      <span className="flex-1 truncate">{template.name}</span>
      {state === 'active-hidden' && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />
      )}
    </button>
  )
}
