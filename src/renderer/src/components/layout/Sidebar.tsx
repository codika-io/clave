import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useBoardStore } from '../../store/board-store'
import { SessionItem } from '../session/SessionItem'
import { SessionGroupItem } from '../session/SessionGroupItem'
import { ContextMenu } from '../ui/ContextMenu'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { cn } from '../../lib/utils'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronRightIcon,
  ViewColumnsIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  TrashIcon,
  Squares2X2Icon,
  FolderMinusIcon,
  ShieldExclamationIcon
} from '@heroicons/react/24/outline'

interface ContextMenuState {
  x: number
  y: number
  items: { label: string; onClick: () => void; shortcut?: string; disabled?: boolean; icon?: React.ReactNode; danger?: boolean }[]
}

interface DropIndicatorState {
  targetId: string
  position: 'before' | 'after' | 'inside'
}

function ClaudeToggle() {
  const claudeMode = useSessionStore((s) => s.claudeMode)
  const toggleClaudeMode = useSessionStore((s) => s.toggleClaudeMode)
  const [hovered, setHovered] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleMouseEnter = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setTooltipPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
    }
    setHovered(true)
  }, [])

  return (
    <div className="flex-shrink-0">
      <button
        ref={btnRef}
        onClick={toggleClaudeMode}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200"
        style={{
          backgroundColor: claudeMode
            ? 'var(--claude-toggle-active)'
            : 'var(--claude-toggle-bg)',
          boxShadow: claudeMode ? 'inset 0 0 12px var(--claude-toggle-glow)' : 'none'
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          style={{ transition: 'opacity 0.2s' }}
        >
          <path
            d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
            fill={claudeMode ? '#D97757' : 'var(--text-secondary)'}
            fillRule="nonzero"
            style={{ transition: 'fill 0.2s' }}
          />
        </svg>
      </button>
      {hovered && (
        <div
          className="fixed pointer-events-none px-2.5 py-1.5 rounded-lg text-[11px] leading-tight whitespace-nowrap z-[9999] bg-surface-300 text-text-primary shadow-lg"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translateX(-50%)'
          }}
        >
          {claudeMode ? 'Claude Code mode' : 'Terminal mode'}
        </div>
      )}
    </div>
  )
}

function DangerousToggle() {
  const dangerousMode = useSessionStore((s) => s.dangerousMode)
  const toggleDangerousMode = useSessionStore((s) => s.toggleDangerousMode)
  const [hovered, setHovered] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleMouseEnter = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setTooltipPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
    }
    setHovered(true)
  }, [])

  return (
    <div className="flex-shrink-0">
      <button
        ref={btnRef}
        onClick={toggleDangerousMode}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200"
        style={{
          backgroundColor: dangerousMode
            ? 'var(--danger-toggle-active)'
            : 'var(--danger-toggle-bg)',
          boxShadow: dangerousMode ? 'inset 0 0 12px var(--danger-toggle-glow)' : 'none'
        }}
      >
      <ShieldExclamationIcon
        className="w-4 h-4"
        strokeWidth={1.5}
        style={{
          color: dangerousMode ? 'var(--danger-toggle-icon)' : 'var(--text-secondary)',
          transition: 'color 0.2s'
        }}
      />
      </button>
      {hovered && (
        <div
          className="fixed pointer-events-none px-2.5 py-1.5 rounded-lg text-[11px] leading-tight whitespace-nowrap z-[9999] bg-surface-300 text-text-primary shadow-lg"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translateX(-50%)'
          }}
        >
          {dangerousMode
            ? '--dangerously-skip-permissions ON'
            : '--dangerously-skip-permissions OFF'}
        </div>
      )}
    </div>
  )
}

function SectionHeading({ title, collapsed, onToggle }: { title: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-4 pt-4 pb-1.5 flex-shrink-0"
    >
      <ChevronRightIcon
        className={cn(
          'w-3 h-3 text-text-tertiary transition-transform duration-150',
          collapsed ? 'rotate-0' : 'rotate-90'
        )}
      />
      <span className="text-xs font-medium text-text-tertiary">
        {title}
      </span>
    </button>
  )
}

export function Sidebar() {
  const sessions = useSessionStore((s) => s.sessions)
  const selectedSessionIds = useSessionStore((s) => s.selectedSessionIds)
  const selectSession = useSessionStore((s) => s.selectSession)
  const selectSessions = useSessionStore((s) => s.selectSessions)
  const addSession = useSessionStore((s) => s.addSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const groups = useSessionStore((s) => s.groups)
  const displayOrder = useSessionStore((s) => s.displayOrder)
  const createGroup = useSessionStore((s) => s.createGroup)
  const ungroupSessions = useSessionStore((s) => s.ungroupSessions)
  const deleteGroup = useSessionStore((s) => s.deleteGroup)
  const moveItems = useSessionStore((s) => s.moveItems)
  const searchQuery = useSessionStore((s) => s.searchQuery)
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery)
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const tasks = useBoardStore((s) => s.tasks)
  const nonDoneCount = tasks.filter((t) => t.status !== 'done').length
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null)

  // Selection anchor for Cmd+Shift range select (Finder behavior)
  const selectionAnchorRef = useRef<string | null>(null)

  // Drag-and-drop state
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null)
  const draggedIdsRef = useRef<string[]>([])
  const dropIndicatorRef = useRef<DropIndicatorState | null>(null)

  const handleNewSession = useCallback(async () => {
    setLoading(true)
    try {
      const folderPath = await window.electronAPI.openFolderDialog()
      if (!folderPath) return

      const state = useSessionStore.getState()
      const sessionInfo = await window.electronAPI.spawnSession(folderPath, {
        dangerousMode: state.dangerousMode,
        claudeMode: state.claudeMode
      })
      addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: sessionInfo.folderName,
        alive: sessionInfo.alive,
        activityStatus: 'idle',
        promptWaiting: null,
        claudeMode: state.claudeMode,
        dangerousMode: state.dangerousMode
      })
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setLoading(false)
    }
  }, [addSession])

  // Cmd+G to group, Cmd+Shift+G to ungroup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        const state = useSessionStore.getState()
        if (e.shiftKey) {
          // Cmd+Shift+G: ungroup — find the group that contains all selected sessions
          const containingGroup = state.groups.find(
            (g) =>
              state.selectedSessionIds.length > 0 &&
              state.selectedSessionIds.every((sid) => g.sessionIds.includes(sid))
          )
          if (containingGroup) {
            ungroupSessions(containingGroup.id)
          }
        } else {
          // Cmd+G: group selected sessions
          if (state.selectedSessionIds.length >= 1) {
            createGroup(state.selectedSessionIds)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createGroup, ungroupSessions])

  const filteredSessions = useMemo(() => {
    if (!searchQuery) return null
    const q = searchQuery.toLowerCase()
    return sessions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.folderName.toLowerCase().includes(q) ||
        s.cwd.toLowerCase().includes(q)
    )
  }, [sessions, searchQuery])

  // Build display list from displayOrder (or fall back to creation order)
  const displayItems = useMemo(() => {
    if (filteredSessions) return null

    const order =
      displayOrder.length > 0
        ? displayOrder
        : (() => {
            const items: string[] = []
            const placedGroups = new Set<string>()
            for (const session of sessions) {
              const group = groups.find((g) => g.sessionIds.includes(session.id))
              if (group) {
                if (!placedGroups.has(group.id)) {
                  placedGroups.add(group.id)
                  items.push(group.id)
                }
              } else {
                items.push(session.id)
              }
            }
            return items
          })()

    return order
      .map((id) => {
        if (groups.some((g) => g.id === id)) return { type: 'group' as const, groupId: id }
        if (sessions.some((s) => s.id === id)) return { type: 'session' as const, sessionId: id }
        return null
      })
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null &&
          (item.type === 'session' ||
            (item.type === 'group' &&
              (groups.find((g) => g.id === item.groupId)?.sessionIds.length ?? 0) > 0))
      )
  }, [displayOrder, sessions, groups, filteredSessions])

  // Flat ordered list of session IDs for range selection
  const flatSessionOrder = useMemo(() => {
    if (filteredSessions) return filteredSessions.map((s) => s.id)
    if (!displayItems) return sessions.map((s) => s.id)
    const order: string[] = []
    for (const item of displayItems) {
      if (item.type === 'session') {
        order.push(item.sessionId)
      } else {
        const group = groups.find((g) => g.id === item.groupId)
        if (group) order.push(...group.sessionIds)
      }
    }
    return order
  }, [filteredSessions, displayItems, sessions, groups])

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await window.electronAPI.killSession(sessionId)
      } catch {
        // session may already be dead
      }
      removeSession(sessionId)
    },
    [removeSession]
  )

  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      const group = groups.find((g) => g.id === groupId)
      if (!group) return
      await Promise.all(
        group.sessionIds.map(async (sid) => {
          try {
            await window.electronAPI.killSession(sid)
          } catch {
            // session may already be dead
          }
        })
      )
      deleteGroup(groupId)
    },
    [groups, deleteGroup]
  )

  const handleSessionContextMenu = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.preventDefault()
      const items: ContextMenuState['items'] = [
        {
          label: 'Rename',
          icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
          onClick: () => setRenamingId(sessionId)
        }
      ]
      const state = useSessionStore.getState()
      if (state.selectedSessionIds.length >= 1) {
        items.push({
          label: 'Group',
          icon: <Squares2X2Icon className="w-3.5 h-3.5" />,
          shortcut: '\u2318G',
          onClick: () => createGroup(state.selectedSessionIds)
        })
      }
      items.push({
        label: 'Delete',
        icon: <TrashIcon className="w-3.5 h-3.5" />,
        danger: true,
        onClick: () => handleDeleteSession(sessionId)
      })
      setContextMenu({ x: e.clientX, y: e.clientY, items })
    },
    [createGroup, handleDeleteSession]
  )

  const handleGroupContextMenu = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      e.preventDefault()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: 'Rename',
            icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
            onClick: () => setRenamingId(groupId)
          },
          {
            label: 'Ungroup',
            icon: <FolderMinusIcon className="w-3.5 h-3.5" />,
            onClick: () => ungroupSessions(groupId)
          },
          {
            label: 'Delete',
            icon: <TrashIcon className="w-3.5 h-3.5" />,
            danger: true,
            onClick: () => handleDeleteGroup(groupId)
          }
        ]
      })
    },
    [ungroupSessions, handleDeleteGroup]
  )

  // Finder-style session click: Click=single, Cmd=toggle, Shift=range, Cmd+Shift=range-add
  const handleSessionClick = useCallback(
    (sessionId: string, modifiers: { metaKey: boolean; shiftKey: boolean }) => {
      if (modifiers.shiftKey) {
        // Range select from anchor
        const anchorId = selectionAnchorRef.current
        if (!anchorId) {
          selectSession(sessionId, false)
          selectionAnchorRef.current = sessionId
          return
        }
        const anchorIdx = flatSessionOrder.indexOf(anchorId)
        const targetIdx = flatSessionOrder.indexOf(sessionId)
        if (anchorIdx === -1 || targetIdx === -1) {
          selectSession(sessionId, false)
          selectionAnchorRef.current = sessionId
          return
        }
        const start = Math.min(anchorIdx, targetIdx)
        const end = Math.max(anchorIdx, targetIdx)
        const rangeIds = flatSessionOrder.slice(start, end + 1)
        if (modifiers.metaKey) {
          // Cmd+Shift: add range to existing selection
          const state = useSessionStore.getState()
          const merged = [...new Set([...state.selectedSessionIds, ...rangeIds])]
          selectSessions(merged)
        } else {
          // Shift only: replace selection with range
          selectSessions(rangeIds)
        }
        // Don't update anchor on shift-click
      } else if (modifiers.metaKey) {
        // Cmd+Click: toggle individual
        selectSession(sessionId, true)
        selectionAnchorRef.current = sessionId
      } else {
        // Plain click: single select
        selectSession(sessionId, false)
        selectionAnchorRef.current = sessionId
      }
    },
    [flatSessionOrder, selectSession, selectSessions]
  )

  const handleGroupClick = useCallback(
    (groupId: string, modifiers: { metaKey: boolean; shiftKey: boolean }) => {
      const group = groups.find((g) => g.id === groupId)
      if (!group) return
      if (modifiers.metaKey) {
        // Cmd+Click: toggle all sessions in group
        const state = useSessionStore.getState()
        const allSelected = group.sessionIds.every((id) => state.selectedSessionIds.includes(id))
        if (allSelected) {
          selectSessions(state.selectedSessionIds.filter((id) => !group.sessionIds.includes(id)))
        } else {
          selectSessions([
            ...state.selectedSessionIds,
            ...group.sessionIds.filter((id) => !state.selectedSessionIds.includes(id))
          ])
        }
        if (group.sessionIds.length > 0) {
          selectionAnchorRef.current = group.sessionIds[0]
        }
      } else {
        // Plain click: select all in group
        selectSessions(group.sessionIds)
        if (group.sessionIds.length > 0) {
          selectionAnchorRef.current = group.sessionIds[0]
        }
      }
    },
    [groups, selectSessions]
  )

  const clearRenaming = useCallback(() => setRenamingId(null), [])

  // --- Drag-and-drop handlers ---

  const handleDragStart = useCallback(
    (e: React.DragEvent, itemId: string, isGroup: boolean) => {
      const state = useSessionStore.getState()
      let ids: string[]
      if (isGroup) {
        ids = [itemId]
      } else if (state.selectedSessionIds.includes(itemId)) {
        // Drag all selected sessions
        ids = state.selectedSessionIds.filter(
          (sid) => !state.groups.some((g) => g.id === sid)
        )
      } else {
        ids = [itemId]
      }

      draggedIdsRef.current = ids
      setDraggingIds(ids)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', itemId)
    },
    []
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string, isGroup: boolean) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'

      // Don't allow dropping on self
      if (draggedIdsRef.current.includes(targetId)) {
        if (dropIndicatorRef.current) {
          dropIndicatorRef.current = null
          setDropIndicator(null)
        }
        return
      }

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const height = rect.height

      let position: 'before' | 'after' | 'inside'
      if (isGroup) {
        const state = useSessionStore.getState()
        const group = state.groups.find((g) => g.id === targetId)
        const isExpanded = group && !group.collapsed

        if (isExpanded) {
          // Expanded group: top 25% = before, rest = inside
          // Children are visible below so there's no gap to place items "after"
          if (y < height * 0.25) position = 'before'
          else position = 'inside'
        } else {
          // Collapsed group: top 25% = before, bottom 25% = after, middle 50% = inside
          if (y < height * 0.25) position = 'before'
          else if (y > height * 0.75) position = 'after'
          else position = 'inside'
        }

        // Don't allow dropping a group inside another group
        if (
          position === 'inside' &&
          draggedIdsRef.current.some((id) =>
            useSessionStore.getState().groups.some((g) => g.id === id)
          )
        ) {
          position = y < height / 2 ? 'before' : 'after'
        }
      } else {
        position = y < height / 2 ? 'before' : 'after'

        const state = useSessionStore.getState()
        const parentGroup = state.groups.find((g) => g.sessionIds.includes(targetId))
        if (parentGroup) {
          const isFirst = parentGroup.sessionIds[0] === targetId
          const isLast = parentGroup.sessionIds[parentGroup.sessionIds.length - 1] === targetId

          // Skip group highlight when dragging a group or reordering within same group
          const isDraggingGroup = draggedIdsRef.current.some((id) =>
            state.groups.some((g) => g.id === id)
          )
          const isDraggingWithinGroup = draggedIdsRef.current.every((id) =>
            parentGroup.sessionIds.includes(id)
          )

          if (!isDraggingGroup && !isDraggingWithinGroup) {
            if (isFirst && isLast) {
              // Single-session group: group highlight except escape zone
              if (y <= height * 0.75) {
                targetId = parentGroup.id
                position = 'inside'
              } else {
                targetId = parentGroup.id
                position = 'after'
              }
            } else if (isFirst) {
              // First session: top half = group highlight, bottom half = normal after
              if (y < height * 0.5) {
                targetId = parentGroup.id
                position = 'inside'
              }
            } else if (isLast) {
              // Last session: top half = normal before, 50-75% = group highlight, >75% = escape
              if (y > height * 0.5 && y <= height * 0.75) {
                targetId = parentGroup.id
                position = 'inside'
              } else if (y > height * 0.75) {
                targetId = parentGroup.id
                position = 'after'
              }
            }
            // Middle sessions: keep default before/after
          } else {
            // No group highlight, but still apply escape zone
            if (isLast && y > height * 0.75) {
              targetId = parentGroup.id
              position = 'after'
            }
          }
        }
      }

      const newIndicator = { targetId, position }
      if (
        !dropIndicatorRef.current ||
        dropIndicatorRef.current.targetId !== targetId ||
        dropIndicatorRef.current.position !== position
      ) {
        dropIndicatorRef.current = newIndicator
        setDropIndicator(newIndicator)
      }
    },
    []
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const indicator = dropIndicatorRef.current
      const ids = draggedIdsRef.current
      if (!indicator || ids.length === 0) return

      moveItems(ids, indicator.targetId, indicator.position)

      draggedIdsRef.current = []
      dropIndicatorRef.current = null
      setDraggingIds([])
      setDropIndicator(null)
    },
    [moveItems]
  )

  const handleDragEnd = useCallback(() => {
    draggedIdsRef.current = []
    dropIndicatorRef.current = null
    setDraggingIds([])
    setDropIndicator(null)
  }, [])

  const handleContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      if (draggedIdsRef.current.length === 0) return

      // Always allow drops on the container — without this, if the cursor
      // drifts into a gap between children (or above/below them), the browser
      // rejects the drop because the last dragover didn't call preventDefault().
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'

      const container = e.currentTarget as HTMLElement
      const children = Array.from(container.children) as HTMLElement[]
      if (children.length === 0) return

      const state = useSessionStore.getState()
      const order =
        state.displayOrder.length > 0
          ? state.displayOrder
          : sessions.map((s) => s.id)

      if (order.length === 0) return

      const firstRect = children[0].getBoundingClientRect()
      const lastRect = children[children.length - 1].getBoundingClientRect()

      const setIndicator = (targetId: string, position: 'before' | 'after') => {
        if (draggedIdsRef.current.includes(targetId)) return
        const newIndicator = { targetId, position }
        if (
          !dropIndicatorRef.current ||
          dropIndicatorRef.current.targetId !== targetId ||
          dropIndicatorRef.current.position !== position
        ) {
          dropIndicatorRef.current = newIndicator
          setDropIndicator(newIndicator)
        }
      }

      if (e.clientY < firstRect.top) {
        // Above all items → drop before first item
        setIndicator(order[0], 'before')
      } else if (e.clientY > lastRect.bottom) {
        // Below all items → drop after last item
        setIndicator(order[order.length - 1], 'after')
      } else {
        // Check gaps between children — enables dropping between groups
        for (let i = 0; i < children.length - 1; i++) {
          const bottomOfCurrent = children[i].getBoundingClientRect().bottom
          const topOfNext = children[i + 1].getBoundingClientRect().top
          if (e.clientY > bottomOfCurrent && e.clientY < topOfNext) {
            // Cursor is in the gap — drop "after" the preceding item
            if (i < order.length) {
              setIndicator(order[i], 'after')
            }
            break
          }
        }
      }
    },
    [sessions]
  )

  // Get the drop indicator for a specific item
  const getDropIndicator = useCallback(
    (itemId: string) => {
      if (dropIndicator && dropIndicator.targetId === itemId) return dropIndicator.position
      return null
    },
    [dropIndicator]
  )

  return (
    <div className="flex flex-col h-full bg-surface-50 border-r border-border-subtle">
      {/* Search row with traffic-light offset — top padding is draggable */}
      <div
        className="pt-11 px-3 pb-2 flex items-center gap-2 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex-1 relative"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-surface-100 border-none text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors"
          />
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-2">
          <ClaudeToggle />
          <DangerousToggle />
          <button
            onClick={handleNewSession}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-100 hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors flex-shrink-0 disabled:opacity-50"
            title="New session"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable sections area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Sessions section */}
        <SectionHeading title="Sessions" collapsed={sessionsCollapsed} onToggle={() => setSessionsCollapsed((c) => !c)} />
        {!sessionsCollapsed && (
          <div
            className="overflow-y-auto px-2 space-y-2"
            style={{ maxHeight: 'calc(75vh - 140px)' }}
            onDragOver={handleContainerDragOver}
            onDrop={handleDrop}
          >
            {filteredSessions ? (
              filteredSessions.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-text-tertiary">
                  No matching sessions
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isSelected={selectedSessionIds.includes(session.id)}
                    onClick={(modifiers) => handleSessionClick(session.id, modifiers)}
                    onContextMenu={(e) => handleSessionContextMenu(e, session.id)}
                    forceEditing={renamingId === session.id}
                    onEditingDone={clearRenaming}
                    onDelete={() => setDeleteConfirmSessionId(session.id)}
                  />
                ))
              )
            ) : displayItems ? (
              displayItems.map((item) => {
                if (item.type === 'session') {
                  const session = sessions.find((s) => s.id === item.sessionId)
                  if (!session) return null
                  return (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isSelected={selectedSessionIds.includes(session.id)}
                      onClick={(modifiers) => handleSessionClick(session.id, modifiers)}
                      onContextMenu={(e) => handleSessionContextMenu(e, session.id)}
                      forceEditing={renamingId === session.id}
                      onEditingDone={clearRenaming}
                      onDragStart={(e) => handleDragStart(e, session.id, false)}
                      onDragOver={(e) => handleDragOver(e, session.id, false)}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                      dropIndicator={getDropIndicator(session.id) as 'before' | 'after' | null}
                      isDragging={draggingIds.includes(session.id)}
                      onDelete={() => setDeleteConfirmSessionId(session.id)}
                    />
                  )
                } else {
                  const group = groups.find((g) => g.id === item.groupId)
                  if (!group || group.sessionIds.length === 0) return null
                  const allGroupSelected =
                    group.sessionIds.length > 0 &&
                    group.sessionIds.every((id) => selectedSessionIds.includes(id))
                  return (
                    <div
                      key={group.id}
                      className={cn(
                        'relative rounded-xl border transition-colors',
                        allGroupSelected
                          ? 'bg-surface-200/60 border-border shadow-[0_0_0.5px_rgba(0,0,0,0.12)]'
                          : 'bg-surface-100/30 border-border-subtle'
                      )}
                    >
                      {getDropIndicator(group.id) === 'inside' && (
                        <div className="absolute inset-0 rounded-xl border-2 border-accent pointer-events-none z-10" />
                      )}
                      <SessionGroupItem
                        group={group}
                        onClick={(modifiers) => handleGroupClick(group.id, modifiers)}
                        onContextMenu={(e) => handleGroupContextMenu(e, group.id)}
                        allSelected={allGroupSelected}
                        forceEditing={renamingId === group.id}
                        onEditingDone={clearRenaming}
                        onDragStart={(e) => handleDragStart(e, group.id, true)}
                        onDragOver={(e) => handleDragOver(e, group.id, true)}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        dropIndicator={getDropIndicator(group.id)}
                        isDragging={draggingIds.includes(group.id)}
                      />
                      {!group.collapsed && (
                        <div className="px-1 pb-1 space-y-0.5">
                          {group.sessionIds.map((sid) => {
                            const session = sessions.find((s) => s.id === sid)
                            if (!session) return null
                            return (
                              <SessionItem
                                key={session.id}
                                session={session}
                                isSelected={selectedSessionIds.includes(session.id)}
                                onClick={(modifiers) => handleSessionClick(session.id, modifiers)}
                                onContextMenu={(e) => handleSessionContextMenu(e, session.id)}
                                grouped
                                groupSelected={allGroupSelected}
                                forceEditing={renamingId === session.id}
                                onEditingDone={clearRenaming}
                                onDragStart={(e) => handleDragStart(e, session.id, false)}
                                onDragOver={(e) => handleDragOver(e, session.id, false)}
                                onDrop={handleDrop}
                                onDragEnd={handleDragEnd}
                                dropIndicator={
                                  getDropIndicator(session.id) as 'before' | 'after' | null
                                }
                                isDragging={draggingIds.includes(session.id)}
                                onDelete={() => setDeleteConfirmSessionId(session.id)}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                }
              })
            ) : null}
          </div>
        )}

        {/* Workspace section */}
        <SectionHeading title="Workspace" collapsed={workspaceCollapsed} onToggle={() => setWorkspaceCollapsed((c) => !c)} />
        {!workspaceCollapsed && (
          <div className="px-2 pt-0.5 flex-shrink-0">
            <button
              onClick={() => setActiveView('board')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                activeView === 'board'
                  ? 'bg-surface-200 text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-100'
              )}
            >
              <ViewColumnsIcon className="flex-shrink-0 w-5 h-5 text-text-tertiary" />
              <span>Board</span>
              {nonDoneCount > 0 && (
                <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
                  {nonDoneCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveView('usage')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                activeView === 'usage'
                  ? 'bg-surface-200 text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-100'
              )}
            >
              <ChartBarIcon className="flex-shrink-0 w-5 h-5 text-text-tertiary" />
              <span>Usage</span>
            </button>
            <button
              onClick={() => setActiveView('settings')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                activeView === 'settings'
                  ? 'bg-surface-200 text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-100'
              )}
            >
              <Cog6ToothIcon className="flex-shrink-0 w-5 h-5 text-text-tertiary" />
              <span>Settings</span>
            </button>
          </div>
        )}

        {/* Fills remaining space */}
        <div className="flex-1" />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete session confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirmSessionId !== null}
        title="Delete session"
        message="Are you sure you want to delete this session? This will terminate the process."
        onConfirm={() => {
          if (deleteConfirmSessionId) handleDeleteSession(deleteConfirmSessionId)
          setDeleteConfirmSessionId(null)
        }}
        onCancel={() => setDeleteConfirmSessionId(null)}
      />
    </div>
  )
}
