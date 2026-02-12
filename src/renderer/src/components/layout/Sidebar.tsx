import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../../store/session-store'
import { SessionItem } from '../session/SessionItem'
import { SessionGroupItem } from '../session/SessionGroupItem'
import { ContextMenu } from '../ui/ContextMenu'
import { cn } from '../../lib/utils'

interface ContextMenuState {
  x: number
  y: number
  items: { label: string; onClick: () => void; shortcut?: string; disabled?: boolean; icon?: React.ReactNode; danger?: boolean }[]
}

interface DropIndicatorState {
  targetId: string
  position: 'before' | 'after' | 'inside'
}

function DangerousToggle() {
  const dangerousMode = useSessionStore((s) => s.dangerousMode)
  const toggleDangerousMode = useSessionStore((s) => s.toggleDangerousMode)

  return (
    <button
      onClick={toggleDangerousMode}
      className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 flex-shrink-0"
      style={{
        backgroundColor: dangerousMode
          ? 'var(--danger-toggle-active)'
          : 'var(--danger-toggle-bg)',
        boxShadow: dangerousMode ? '0 0 12px var(--danger-toggle-glow)' : 'none'
      }}
      title={
        dangerousMode
          ? 'Skip permissions ON — new sessions use --dangerously-skip-permissions'
          : 'Skip permissions OFF'
      }
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        style={{
          color: dangerousMode ? '#fff' : 'var(--text-secondary)',
          transition: 'color 0.2s'
        }}
      >
        <path
          d="M7 1L1.5 4v3c0 3.5 2.3 6.2 5.5 7 3.2-.8 5.5-3.5 5.5-7V4L7 1z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
          fill={dangerousMode ? 'rgba(255,255,255,0.2)' : 'none'}
        />
        <path
          d="M7 4.5v3M7 9v.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
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
  const moveItems = useSessionStore((s) => s.moveItems)
  const searchQuery = useSessionStore((s) => s.searchQuery)
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery)
  const [loading, setLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

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

      const isDangerous = useSessionStore.getState().dangerousMode
      const sessionInfo = await window.electronAPI.spawnSession(folderPath, {
        dangerousMode: isDangerous
      })
      addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: sessionInfo.folderName,
        alive: sessionInfo.alive
      })
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setLoading(false)
    }
  }, [addSession])

  // Cmd+G to group selected sessions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'g') {
        e.preventDefault()
        const state = useSessionStore.getState()
        if (state.selectedSessionIds.length > 1) {
          createGroup(state.selectedSessionIds)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createGroup])

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

  const handleSessionContextMenu = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.preventDefault()
      const renameIcon = (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M8.5 2.5l3 3M2 9.5L9.5 2l3 3L5 12.5H2v-3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
      const deleteIcon = (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 4h9M5 4V2.5h4V4M3.5 4l.5 8h6l.5-8M6 6.5v3M8 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
      const groupIcon = (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="4.5" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
      const items: ContextMenuState['items'] = [
        {
          label: 'Rename',
          icon: renameIcon,
          onClick: () => setRenamingId(sessionId)
        }
      ]
      const state = useSessionStore.getState()
      if (state.selectedSessionIds.length > 1) {
        items.push({
          label: 'Group',
          icon: groupIcon,
          shortcut: '\u2318G',
          onClick: () => createGroup(state.selectedSessionIds)
        })
      }
      items.push({
        label: 'Delete',
        icon: deleteIcon,
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
      const renameIcon = (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M8.5 2.5l3 3M2 9.5L9.5 2l3 3L5 12.5H2v-3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
      const ungroupIcon = (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
          <path d="M5 7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: 'Rename',
            icon: renameIcon,
            onClick: () => setRenamingId(groupId)
          },
          {
            label: 'Ungroup',
            icon: ungroupIcon,
            onClick: () => ungroupSessions(groupId)
          }
        ]
      })
    },
    [ungroupSessions]
  )

  const handleGroupClick = useCallback(
    (groupId: string, shiftKey: boolean) => {
      const group = groups.find((g) => g.id === groupId)
      if (!group) return
      if (shiftKey) {
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
      } else {
        selectSessions(group.sessionIds)
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
        // For groups: top 25% = before, bottom 25% = after, middle 50% = inside
        if (y < height * 0.25) position = 'before'
        else if (y > height * 0.75) position = 'after'
        else position = 'inside'

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
      {/* Search row with traffic-light offset */}
      <div className="pt-11 px-3 pb-2 flex items-center gap-2">
        <div className="flex-1 relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
          >
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M9.5 9.5L12.5 12.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-surface-100 border-none text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors"
          />
        </div>
        <DangerousToggle />
        <button
          onClick={handleNewSession}
          disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-100 hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors flex-shrink-0 disabled:opacity-50"
          title="New session"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v12M1 7h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
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
                onClick={(shiftKey) => selectSession(session.id, shiftKey)}
                onContextMenu={(e) => handleSessionContextMenu(e, session.id)}
                forceEditing={renamingId === session.id}
                onEditingDone={clearRenaming}
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
                  onClick={(shiftKey) => selectSession(session.id, shiftKey)}
                  onContextMenu={(e) => handleSessionContextMenu(e, session.id)}
                  forceEditing={renamingId === session.id}
                  onEditingDone={clearRenaming}
                  onDragStart={(e) => handleDragStart(e, session.id, false)}
                  onDragOver={(e) => handleDragOver(e, session.id, false)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  dropIndicator={getDropIndicator(session.id) as 'before' | 'after' | null}
                  isDragging={draggingIds.includes(session.id)}
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
                    'rounded-lg transition-colors',
                    allGroupSelected && 'bg-surface-200'
                  )}
                >
                  <SessionGroupItem
                    group={group}
                    onClick={(shiftKey) => handleGroupClick(group.id, shiftKey)}
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
                    <div className="pl-4">
                      {group.sessionIds.map((sid) => {
                        const session = sessions.find((s) => s.id === sid)
                        if (!session) return null
                        return (
                          <SessionItem
                            key={session.id}
                            session={session}
                            isSelected={selectedSessionIds.includes(session.id)}
                            onClick={(shiftKey) => selectSession(session.id, shiftKey)}
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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
