import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useSessionStore,
  GROUP_TERMINAL_COLORS,
  resolveColorHex,
  type GroupTerminalColor
} from '../../store/session-store'
import ColorPicker from '../ui/ColorPicker'
import { useTemplateStore } from '../../store/template-store'

import { resetToDefaultTemplate } from '../../hooks/use-launch-template'
import { SessionItem } from '../session/SessionItem'
import { FileTabItem } from '../session/FileTabItem'
import { SessionGroupItem } from '../session/SessionGroupItem'
import { ContextMenu } from '../ui/ContextMenu'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { GroupCommandDialog } from '../ui/GroupCommandDialog'
import { ExportClaveDialog } from '../ui/ExportClaveDialog'
import { cn } from '../../lib/utils'
import { SectionHeading, TaskQueueSection } from './SidebarSections'
import { NewSessionDropdown } from './NewSessionDropdown'
import { RemoteDirectoryPicker } from '../ui/RemoteDirectoryPicker'
import { useAgentStore } from '../../store/agent-store'
import { useLocationStore } from '../../store/location-store'
import { usePinnedStore, pinGroupFromCurrent, removePinnedGroupWithCleanup, resyncPinnedGroup, findPinnedByGroupId, isPinnedOutOfSync, getHiddenGroupIds, exportClaveFile, getExportFileName, initClaveFileWatchers } from '../../store/pinned-store'
import { PinnedGroupsGrid } from '../session/PinnedGroupsGrid'
import { useSidebarDnd, GAP_HEIGHT } from '../../hooks/use-sidebar-dnd'
import { SidebarFooter } from './SidebarFooter'
import { ScrollArea } from '../ui/scroll-area'
import {
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  Squares2X2Icon,
  FolderMinusIcon,
  CommandLineIcon,
  ArrowPathIcon,
  XMarkIcon,
  DocumentDuplicateIcon,
  BookmarkIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline'

interface ContextMenuState {
  x: number
  y: number
  items: { label: string; onClick: () => void; shortcut?: string; disabled?: boolean; icon?: React.ReactNode; danger?: boolean }[]
  header?: React.ReactNode
}

function GroupColorPickerHeader({ groupId, initialColor }: { groupId: string; initialColor: GroupTerminalColor | null }) {
  const setGroupColor = useSessionStore((s) => s.setGroupColor)
  const currentColor = useSessionStore((s) => s.groups.find((g) => g.id === groupId)?.color ?? null)

  return (
    <ColorPicker
      value={currentColor ?? initialColor}
      onChange={(color) => setGroupColor(groupId, color)}
      showNoColor
    />
  )
}

/** Animated gap spacer for drop displacement */
function DropGap({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        'transition-[height,opacity] duration-200 ease-out overflow-hidden',
        active && 'sidebar-drop-gap-active'
      )}
      style={{ height: active ? GAP_HEIGHT : 0, opacity: active ? 1 : 0 }}
    >
      {active && (
        <div className="mx-2 h-0.5 mt-[17px] bg-accent rounded-full" />
      )}
    </div>
  )
}

/** Check if a gap should show before an item (normalizes 'before X' and 'after previous') */
function shouldShowGapBefore(
  dropIndicator: { targetId: string; position: string } | null,
  itemId: string,
  prevItemId: string | null
): boolean {
  if (!dropIndicator) return false
  if (dropIndicator.targetId === itemId && dropIndicator.position === 'before') return true
  if (prevItemId && dropIndicator.targetId === prevItemId && dropIndicator.position === 'after') return true
  return false
}


export function Sidebar() {
  const sessions = useSessionStore((s) => s.sessions)
  const selectedSessionIds = useSessionStore((s) => s.selectedSessionIds)
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const selectSession = useSessionStore((s) => s.selectSession)
  const selectSessions = useSessionStore((s) => s.selectSessions)
  const addSession = useSessionStore((s) => s.addSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const groups = useSessionStore((s) => s.groups)
  const displayOrder = useSessionStore((s) => s.displayOrder)
  const createGroup = useSessionStore((s) => s.createGroup)
  const ungroupSessions = useSessionStore((s) => s.ungroupSessions)
  const deleteGroup = useSessionStore((s) => s.deleteGroup)
  const setGroupColor = useSessionStore((s) => s.setGroupColor)
  const toggleGroupCollapsed = useSessionStore((s) => s.toggleGroupCollapsed)
  const moveItems = useSessionStore((s) => s.moveItems)
  const addGroupTerminal = useSessionStore((s) => s.addGroupTerminal)
  const removeGroupTerminal = useSessionStore((s) => s.removeGroupTerminal)
  const setGroupTerminalSessionId = useSessionStore((s) => s.setGroupTerminalSessionId)
  const setGroupCwd = useSessionStore((s) => s.setGroupCwd)
  const fileTabs = useSessionStore((s) => s.fileTabs)
  const removeFileTab = useSessionStore((s) => s.removeFileTab)
  const searchQuery = useSessionStore((s) => s.searchQuery)
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery)
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)
  const [boardCollapsed, setBoardCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [terminalDialogState, setTerminalDialogState] = useState<{
    groupId: string
    terminalId: string | null // null = adding new
  } | null>(null)

  // Remote session picker state
  const [remotePickerState, setRemotePickerState] = useState<{
    locationId: string
    locationName: string
    claudeMode: boolean
  } | null>(null)

  const spawnRemoteSession = useCallback(async (
    locationId: string, cwd: string, claudeMode: boolean
  ) => {
    setLoading(true)
    try {
      const shellId = await window.electronAPI.sshOpenShell(locationId, cwd)

      if (claudeMode) {
        // Write claude command after shell initializes (login shell needs time)
        setTimeout(() => {
          window.electronAPI.sshShellWrite(shellId, 'claude\r')
        }, 500)
      }

      const folderName = cwd.split('/').filter(Boolean).pop() || cwd

      addSession({
        id: shellId,
        cwd,
        folderName,
        name: folderName,
        alive: true,
        activityStatus: 'idle',
        promptWaiting: null,
        claudeMode,
        dangerousMode: false,
        claudeSessionId: null,
        locationId,
        shellId,
        sessionType: claudeMode ? 'remote-claude' : 'remote-terminal'
      })
    } catch (err) {
      console.error('Failed to create remote session:', err)
    } finally {
      setLoading(false)
    }
  }, [addSession])

  const defaultTemplateId = useTemplateStore((s) => s.defaultTemplateId)
  const templates = useTemplateStore((s) => s.templates)

  const defaultTemplateName = useMemo(() => {
    if (defaultTemplateId === 'blank') return null
    return templates.find((t) => t.id === defaultTemplateId)?.name ?? null
  }, [defaultTemplateId, templates])



  const handleResetSessions = useCallback(async () => {
    setResetConfirmOpen(false)
    await resetToDefaultTemplate()
  }, [])

  // Selection anchor for Cmd+Shift range select (Finder behavior)
  const selectionAnchorRef = useRef<string | null>(null)

  // Scroll container ref for DnD
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedZoneRef = useRef<HTMLDivElement>(null)

  // Handle drop on pinned zone
  const handlePinnedDrop = useCallback((groupId: string) => {
    const existing = findPinnedByGroupId(groupId)
    if (!existing) {
      pinGroupFromCurrent(groupId)
    }
    // If already pinned, do nothing (visual highlight was already shown)
  }, [])

  // Pointer-based DnD
  const { isDragging, draggedIds, dropIndicator, isOverPinnedZone, handlePointerDown } = useSidebarDnd({
    containerRef: scrollContainerRef,
    moveItems,
    pinnedZoneRef,
    onPinnedDrop: handlePinnedDrop
  })

  // Determine if dragging a group (for pinned zone drop target)
  const draggedGroupId = useMemo(() => {
    if (!isDragging || draggedIds.length !== 1) return null
    const isGroup = groups.some((g) => g.id === draggedIds[0])
    return isGroup ? draggedIds[0] : null
  }, [isDragging, draggedIds, groups])

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
        dangerousMode: state.dangerousMode,
        claudeSessionId: sessionInfo.claudeSessionId,
        sessionType: 'local'
      })
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setLoading(false)
    }
  }, [addSession])

  // Cmd+G to group, Cmd+Alt+G to ungroup, Cmd+F to toggle search, Cmd+Shift+Delete to reset
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'g') {
        // Cmd+G: group selected sessions
        e.preventDefault()
        const state = useSessionStore.getState()
        if (state.selectedSessionIds.length >= 1) {
          createGroup(state.selectedSessionIds)
        }
      }
      if (e.metaKey && e.altKey && e.key.toLowerCase() === 'g') {
        // Cmd+Alt+G: ungroup
        e.preventDefault()
        const state = useSessionStore.getState()
        const containingGroup = state.groups.find(
          (g) =>
            state.selectedSessionIds.length > 0 &&
            state.selectedSessionIds.every((sid) => g.sessionIds.includes(sid))
        )
        if (containingGroup) {
          ungroupSessions(containingGroup.id)
        }
      }
      // Cmd+Shift+Delete: reset all sessions
      if (e.metaKey && e.shiftKey && e.key === 'Backspace') {
        e.preventDefault()
        if (useSessionStore.getState().sessions.length > 0) {
          setResetConfirmOpen(true)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createGroup, ungroupSessions])

  // Initialize .clave file watchers + load workspace config
  useEffect(() => {
    const cleanup = initClaveFileWatchers()
    import('../../store/workspace-store').then(({ loadWorkspaces }) => loadWorkspaces())
    return cleanup
  }, [])

  // Detect file drag over window (for showing pinned section as drop target)
  const [isFileDragOverWindow, setIsFileDragOverWindow] = useState(false)
  useEffect(() => {
    let dragCounter = 0
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter++
        setIsFileDragOverWindow(true)
      }
    }
    const handleDragLeave = () => {
      dragCounter--
      if (dragCounter <= 0) {
        dragCounter = 0
        setIsFileDragOverWindow(false)
      }
    }
    const handleDrop = () => {
      dragCounter = 0
      setIsFileDragOverWindow(false)
    }
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  const aliveSessionIds = useMemo(
    () => new Set<string>(sessions.filter((s) => s.alive).map((s) => s.id)),
    [sessions]
  )

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

  // Track pinned group visibility to filter hidden groups from the sessions list
  const pinnedGroups = usePinnedStore((s) => s.pinnedGroups)

  // Build display list from displayOrder (or fall back to creation order)
  const displayItems = useMemo(() => {
    if (filteredSessions) return null

    const hiddenGroupIds = getHiddenGroupIds()

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
        if (fileTabs.some((f) => f.id === id)) return { type: 'fileTab' as const, fileTabId: id }
        return null
      })
      .filter(
        (item): item is NonNullable<typeof item> => {
          if (item === null) return false
          if (item.type === 'session') return true
          if (item.type === 'fileTab') return true
          if (item.type === 'group') {
            const group = groups.find((g) => g.id === item.groupId)
            if (!group || group.sessionIds.length === 0) return false
            // Hide groups toggled off via pinned buttons
            if (hiddenGroupIds.has(item.groupId)) return false
            return true
          }
          return false
        }
      )
  }, [displayOrder, sessions, groups, fileTabs, filteredSessions, pinnedGroups])

  // Flat ordered list of session/file tab IDs for range selection
  const flatSessionOrder = useMemo(() => {
    if (filteredSessions) return filteredSessions.map((s) => s.id)
    if (!displayItems) return sessions.map((s) => s.id)
    const order: string[] = []
    for (const item of displayItems) {
      if (item.type === 'session') {
        order.push(item.sessionId)
      } else if (item.type === 'fileTab') {
        order.push(item.fileTabId)
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

  // Spawn a group terminal and auto-focus it
  const spawnGroupTerminal = useCallback(
    async (groupId: string, terminalId: string, command: string, commandMode: 'prefill' | 'auto', cwdOverride?: string | null) => {
      const state = useSessionStore.getState()
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return

      const cwd = cwdOverride || group.cwd || state.sessions.find((s) => group.sessionIds.includes(s.id))?.cwd
      if (!cwd) return

      try {
        const sessionInfo = await window.electronAPI.spawnSession(cwd, {
          claudeMode: false,
          initialCommand: command || undefined,
          autoExecute: command ? commandMode === 'auto' : false
        })
        const newSession = {
          id: sessionInfo.id,
          cwd: sessionInfo.cwd,
          folderName: sessionInfo.folderName,
          name: `${group.name} terminal`,
          alive: sessionInfo.alive,
          activityStatus: 'idle' as const,
          promptWaiting: null,
          claudeMode: false,
          dangerousMode: false,
          claudeSessionId: sessionInfo.claudeSessionId,
          sessionType: 'local' as const
        }

        const currentState = useSessionStore.getState()
        useSessionStore.setState({
          sessions: [...currentState.sessions, newSession],
          selectedSessionIds: [sessionInfo.id],
          focusedSessionId: sessionInfo.id
        })
        setGroupTerminalSessionId(groupId, terminalId, sessionInfo.id)
      } catch (err) {
        console.error('Failed to spawn group terminal:', err)
      }
    },
    [setGroupTerminalSessionId]
  )

  // Click a colored terminal icon: focus if alive, spawn if dead
  const handleTerminalIconClick = useCallback(
    (groupId: string, terminalId: string) => {
      const state = useSessionStore.getState()
      const group = state.groups.find((g) => g.id === groupId)
      const config = group?.terminals.find((t) => t.id === terminalId)
      if (!config) return

      if (config.sessionId) {
        const session = state.sessions.find((s) => s.id === config.sessionId && s.alive)
        if (session) {
          selectSession(config.sessionId, false)
          return
        }
      }

      spawnGroupTerminal(groupId, terminalId, config.command, config.commandMode)
    },
    [selectSession, spawnGroupTerminal]
  )

  // Click the grey/+ add icon: open dialog in "add" mode
  const handleAddTerminalClick = useCallback(
    (groupId: string) => {
      setTerminalDialogState({ groupId, terminalId: null })
    },
    []
  )

  // Right-click a terminal icon: show edit/delete context menu
  const handleTerminalIconContextMenu = useCallback(
    (groupId: string, terminalId: string, e: React.MouseEvent) => {
      const group = groups.find((g) => g.id === groupId)
      const config = group?.terminals.find((t) => t.id === terminalId)
      if (!config) return

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: 'Edit',
            icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
            onClick: () => setTerminalDialogState({ groupId, terminalId })
          },
          {
            label: 'Delete',
            icon: <TrashIcon className="w-3.5 h-3.5" />,
            danger: true,
            onClick: () => {
              if (config.sessionId) {
                window.electronAPI.killSession(config.sessionId).catch(() => {})
              }
              removeGroupTerminal(groupId, terminalId)
            }
          }
        ]
      })
    },
    [groups, removeGroupTerminal]
  )

  const hideAgentSession = useSessionStore((s) => s.hideAgentSession)

  const handleDuplicateSession = useCallback(
    async (sessionId: string) => {
      const state = useSessionStore.getState()
      const session = state.sessions.find((s) => s.id === sessionId)
      if (!session) return

      // Find if session belongs to a group
      const parentGroup = state.groups.find((g) => g.sessionIds.includes(sessionId))

      let newSessionId: string | null = null

      if (session.sessionType === 'remote-terminal' || session.sessionType === 'remote-claude') {
        if (session.locationId) {
          // spawnRemoteSession calls addSession internally, so we need to track the new ID
          const shellId = await window.electronAPI.sshOpenShell(session.locationId, session.cwd)
          if (session.claudeMode) {
            setTimeout(() => {
              window.electronAPI.sshShellWrite(shellId, 'claude\r')
            }, 500)
          }
          const folderName = session.cwd.split('/').filter(Boolean).pop() || session.cwd
          addSession({
            id: shellId,
            cwd: session.cwd,
            folderName,
            name: folderName,
            alive: true,
            activityStatus: 'idle',
            promptWaiting: null,
            claudeMode: session.claudeMode,
            dangerousMode: false,
            claudeSessionId: null,
            locationId: session.locationId,
            shellId,
            sessionType: session.sessionType,
            detectedUrl: null
          })
          newSessionId = shellId
        }
      } else {
        // Local session
        try {
          const sessionInfo = await window.electronAPI.spawnSession(session.cwd, {
            claudeMode: session.claudeMode,
            dangerousMode: session.dangerousMode
          })
          addSession({
            id: sessionInfo.id,
            cwd: sessionInfo.cwd,
            folderName: sessionInfo.folderName,
            name: sessionInfo.folderName,
            alive: sessionInfo.alive,
            activityStatus: 'idle',
            promptWaiting: null,
            claudeMode: session.claudeMode,
            dangerousMode: session.dangerousMode,
            claudeSessionId: sessionInfo.claudeSessionId,
            sessionType: 'local',
            detectedUrl: null
          })
          newSessionId = sessionInfo.id
        } catch (err) {
          console.error('Failed to duplicate session:', err)
        }
      }

      // Move new session into the same group, right after the original
      if (newSessionId && parentGroup) {
        useSessionStore.getState().moveItems([newSessionId], sessionId, 'after')
      }
    },
    [addSession]
  )

  const handleSessionContextMenu = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.preventDefault()
      const session = sessions.find((s) => s.id === sessionId)

      // Agent-specific context menu
      if (session?.sessionType === 'agent') {
        const items: ContextMenuState['items'] = [
          {
            label: 'Rename',
            icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
            onClick: () => setRenamingId(sessionId)
          },
          {
            label: 'Hide from sidebar',
            icon: <XMarkIcon className="w-3.5 h-3.5" />,
            onClick: () => hideAgentSession(sessionId)
          },
          {
            label: 'Clear messages',
            icon: <TrashIcon className="w-3.5 h-3.5" />,
            onClick: () => {
              if (session.agentId) useAgentStore.getState().clearMessages(session.agentId)
            }
          }
        ]
        setContextMenu({ x: e.clientX, y: e.clientY, items })
        return
      }

      const items: ContextMenuState['items'] = [
        {
          label: 'Rename',
          icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
          onClick: () => setRenamingId(sessionId)
        },
        {
          label: 'Duplicate',
          icon: <DocumentDuplicateIcon className="w-3.5 h-3.5" />,
          onClick: () => handleDuplicateSession(sessionId)
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
    [sessions, createGroup, handleDeleteSession, handleDuplicateSession, hideAgentSession]
  )

  const handleGroupContextMenu = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      e.preventDefault()
      const group = groups.find((g) => g.id === groupId)
      const currentColor = group?.color ?? null
      const existingPin = findPinnedByGroupId(groupId)
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        header: (
          <GroupColorPickerHeader
            groupId={groupId}
            initialColor={currentColor}
          />
        ),
        items: [
          existingPin
            ? isPinnedOutOfSync(groupId)
              ? {
                  label: 'Re-sync pin',
                  icon: <BookmarkIcon className="w-3.5 h-3.5" />,
                  onClick: () => resyncPinnedGroup(groupId)
                }
              : null
            : {
                label: 'Pin group',
                icon: <BookmarkIcon className="w-3.5 h-3.5" />,
                onClick: () => pinGroupFromCurrent(groupId)
              },
          {
            label: 'Rename',
            icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
            onClick: () => setRenamingId(groupId)
          },
          {
            label: 'Add terminal',
            icon: <CommandLineIcon className="w-3.5 h-3.5" />,
            onClick: () => setTerminalDialogState({ groupId, terminalId: null })
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
        ].filter((item): item is NonNullable<typeof item> => item !== null)
      })
    },
    [groups, ungroupSessions, handleDeleteGroup, setGroupColor]
  )

  const handleFileTabContextMenu = useCallback(
    (e: React.MouseEvent, fileTabId: string) => {
      e.preventDefault()
      const fileTab = fileTabs.find((f) => f.id === fileTabId)
      if (!fileTab) return
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: 'Rename',
            icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
            onClick: () => setRenamingId(fileTabId)
          },
          {
            label: 'Copy Path',
            onClick: () => navigator.clipboard.writeText(fileTab.filePath)
          },
          {
            label: 'Reveal in Finder',
            onClick: () => window.electronAPI?.showItemInFolder(fileTab.filePath)
          },
          {
            label: 'Close',
            icon: <XMarkIcon className="w-3.5 h-3.5" />,
            danger: true,
            onClick: () => removeFileTab(fileTabId)
          }
        ]
      })
    },
    [fileTabs, removeFileTab]
  )

  // Finder-style session click: Click=single, Cmd=toggle, Shift=range, Cmd+Shift=range-add
  const handleSessionClick = useCallback(
    (sessionId: string, modifiers: { metaKey: boolean; shiftKey: boolean }) => {
      // Agent sessions → switch to chat panel
      const session = sessions.find((s) => s.id === sessionId)
      if (session?.sessionType === 'agent' && session.agentId) {
        useAgentStore.getState().setActiveAgent(session.agentId)
        selectSession(sessionId, false) // selectSession sets activeView to 'agents' for agent sessions
        selectionAnchorRef.current = sessionId
        return
      }

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
    [sessions, flatSessionOrder, selectSession, selectSessions]
  )

  const handleGroupClick = useCallback(
    (groupId: string, modifiers: { metaKey: boolean; shiftKey: boolean }) => {
      const group = groups.find((g) => g.id === groupId)
      if (!group) return
      const state = useSessionStore.getState()
      if (modifiers.metaKey) {
        // Cmd+Click: toggle all sessions in group
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
        const allSelected =
          group.sessionIds.length > 0 &&
          group.sessionIds.every((id) => state.selectedSessionIds.includes(id))
        if (group.collapsed) {
          // Collapsed group: expand it and select
          toggleGroupCollapsed(group.id)
          selectSessions(group.sessionIds)
        } else if (allSelected) {
          // Already selected and expanded: collapse it
          toggleGroupCollapsed(group.id)
        } else {
          // Not selected: select it
          selectSessions(group.sessionIds)
        }
        if (group.sessionIds.length > 0) {
          selectionAnchorRef.current = group.sessionIds[0]
        }
      }
    },
    [groups, selectSessions, toggleGroupCollapsed]
  )

  const clearRenaming = useCallback(() => setRenamingId(null), [])

  // Get the top-level item ID for gap calculation
  const getItemId = useCallback((item: { type: string; sessionId?: string; fileTabId?: string; groupId?: string }) => {
    if (item.type === 'session') return item.sessionId ?? ''
    if (item.type === 'fileTab') return item.fileTabId ?? ''
    if (item.type === 'group') return item.groupId ?? ''
    return ''
  }, [])

  return (
    <div className="flex flex-col h-full bg-surface-50">
      {/* Action bar with traffic-light offset — top padding is draggable */}
      <div
        className="pt-11 px-3 pb-2 flex items-center gap-1.5 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex-1 relative flex items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
          <input
            ref={searchInputRef}
            data-sidebar-search
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('')
                searchInputRef.current?.blur()
              }
            }}
            className="w-full h-7 pl-8 pr-2 rounded-lg bg-surface-100 border-none text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors"
          />
        </div>
        <button
          onClick={() => setResetConfirmOpen(true)}
          disabled={sessions.length === 0}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0 disabled:opacity-30 disabled:pointer-events-none"
          title="Reset sessions"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ArrowPathIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Single scrollable area for all sections */}
      <ScrollArea
        viewportRef={scrollContainerRef}
        className="flex-1 min-h-0"
      >
        {/* Pinned groups section */}
        <PinnedSection
          setContextMenu={setContextMenu}
          pinnedZoneRef={pinnedZoneRef}
          isOverPinnedZone={isOverPinnedZone}
          draggedGroupId={draggedGroupId}
          isFileDragOver={isFileDragOverWindow}
        />

        {/* Sessions section */}
        <SectionHeading
          title="Sessions"
          collapsed={sessionsCollapsed}
          onToggle={() => setSessionsCollapsed((c) => !c)}
          actions={
            <NewSessionDropdown
              onNewSession={({ claudeMode, dangerousMode, locationId }) => {
                if (locationId) {
                  // Remote: open directory picker
                  const loc = useLocationStore.getState().locations.find((l) => l.id === locationId)
                  setRemotePickerState({ locationId, locationName: loc?.name ?? '', claudeMode })
                } else {
                  // Local: existing flow (temporary mode override -> handleNewSession)
                  const store = useSessionStore.getState()
                  const prevClaude = store.claudeMode
                  const prevDangerous = store.dangerousMode
                  if (claudeMode !== prevClaude) useSessionStore.setState({ claudeMode })
                  if (dangerousMode !== prevDangerous) useSessionStore.setState({ dangerousMode })
                  handleNewSession().finally(() => {
                    if (claudeMode !== prevClaude) useSessionStore.setState({ claudeMode: prevClaude })
                    if (dangerousMode !== prevDangerous) useSessionStore.setState({ dangerousMode: prevDangerous })
                  })
                }
              }}
              loading={loading}
            />
          }
        />
        <div
          className="grid transition-[grid-template-rows,opacity,transform] duration-250 ease-out"
          style={{ gridTemplateRows: sessionsCollapsed ? '0fr' : '1fr', opacity: sessionsCollapsed ? 0 : 1, transform: sessionsCollapsed ? 'translateY(-4px)' : 'translateY(0)' }}
        >
          <div className="overflow-hidden">
          <div className="px-2 space-y-2">
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
              <>
                {displayItems.map((item, index) => {
                  const itemId = getItemId(item)
                  const prevItemId = index > 0 ? getItemId(displayItems[index - 1]) : null
                  const isLastItem = index === displayItems.length - 1
                  const gapBefore = isDragging && shouldShowGapBefore(dropIndicator, itemId, prevItemId)

                  if (item.type === 'fileTab') {
                    const fileTab = fileTabs.find((f) => f.id === item.fileTabId)
                    if (!fileTab) return null
                    return (
                      <div key={fileTab.id}>
                        <DropGap active={gapBefore} />
                        <FileTabItem
                          fileTab={fileTab}
                          isSelected={selectedSessionIds.includes(fileTab.id)}
                          onClick={(modifiers) => handleSessionClick(fileTab.id, modifiers)}
                          onContextMenu={(e) => handleFileTabContextMenu(e, fileTab.id)}
                          forceEditing={renamingId === fileTab.id}
                          onEditingDone={clearRenaming}
                          onPointerDown={(e) => handlePointerDown(e, fileTab.id, false)}
                          isDragging={draggedIds.includes(fileTab.id)}
                        />
                        {isLastItem && (
                          <DropGap
                            active={isDragging && dropIndicator?.targetId === itemId && dropIndicator?.position === 'after'}
                          />
                        )}
                      </div>
                    )
                  } else if (item.type === 'session') {
                    const session = sessions.find((s) => s.id === item.sessionId)
                    if (!session) return null
                    return (
                      <div key={session.id}>
                        <DropGap active={gapBefore} />
                        <SessionItem
                          session={session}
                          isSelected={selectedSessionIds.includes(session.id)}
                          onClick={(modifiers) => handleSessionClick(session.id, modifiers)}
                          onContextMenu={(e) => handleSessionContextMenu(e, session.id)}
                          forceEditing={renamingId === session.id}
                          onEditingDone={clearRenaming}
                          onPointerDown={(e) => handlePointerDown(e, session.id, false)}
                          isDragging={draggedIds.includes(session.id)}
                          onDelete={() => setDeleteConfirmSessionId(session.id)}
                        />
                        {isLastItem && (
                          <DropGap
                            active={isDragging && dropIndicator?.targetId === itemId && dropIndicator?.position === 'after'}
                          />
                        )}
                      </div>
                    )
                  } else {
                    const group = groups.find((g) => g.id === item.groupId)
                    if (!group || group.sessionIds.length === 0) return null
                    const allGroupSelected =
                      group.sessionIds.length > 0 &&
                      group.sessionIds.every((id) => selectedSessionIds.includes(id))
                    const groupColorHex = resolveColorHex(group.color)
                    return (
                      <div key={group.id}>
                        <DropGap active={gapBefore} />
                        <div
                          className={cn(
                            'relative rounded-xl border transition-colors',
                            !groupColorHex && (allGroupSelected
                              ? 'bg-surface-200/60 border-border shadow-[0_0_0.5px_rgba(0,0,0,0.12)]'
                              : 'bg-surface-100/30 border-border-subtle hover:bg-surface-100/60')
                          )}
                          style={groupColorHex ? {
                            backgroundColor: allGroupSelected ? `${groupColorHex}35` : `${groupColorHex}10`,
                            borderColor: allGroupSelected ? `${groupColorHex}60` : `${groupColorHex}30`
                          } : undefined}
                          onMouseEnter={(e) => { if (groupColorHex && !allGroupSelected) e.currentTarget.style.backgroundColor = `${groupColorHex}20` }}
                          onMouseLeave={(e) => { if (groupColorHex) e.currentTarget.style.backgroundColor = allGroupSelected ? `${groupColorHex}35` : `${groupColorHex}10` }}
                        >
                          {dropIndicator?.targetId === group.id && dropIndicator.position === 'inside' && (
                            <div className="absolute inset-0 rounded-xl border-2 border-accent pointer-events-none z-10 transition-opacity duration-150" />
                          )}
                          <SessionGroupItem
                            group={group}
                            onClick={(modifiers) => handleGroupClick(group.id, modifiers)}
                            onContextMenu={(e) => handleGroupContextMenu(e, group.id)}
                            onTerminalIconClick={(tid) => handleTerminalIconClick(group.id, tid)}
                            onTerminalIconContextMenu={(tid, e) => handleTerminalIconContextMenu(group.id, tid, e)}
                            onAddTerminalClick={() => handleAddTerminalClick(group.id)}
                            aliveSessionIds={aliveSessionIds}
                            focusedSessionId={focusedSessionId}
                            allSelected={allGroupSelected}
                            forceEditing={renamingId === group.id}
                            onEditingDone={clearRenaming}
                            onPointerDown={(e) => handlePointerDown(e, group.id, true)}
                            isDragging={draggedIds.includes(group.id)}
                          />
                          <div
                            className="grid transition-[grid-template-rows,opacity,transform] duration-250 ease-out"
                            style={{ gridTemplateRows: group.collapsed ? '0fr' : '1fr', opacity: group.collapsed ? 0 : 1, transform: group.collapsed ? 'translateY(-4px)' : 'translateY(0)' }}
                          >
                            <div className="overflow-hidden">
                              <div className="px-1 pb-1 space-y-0.5">
                                {group.sessionIds.map((sid, sIdx) => {
                                  const prevSid = sIdx > 0 ? group.sessionIds[sIdx - 1] : null
                                  const isLastInGroup = sIdx === group.sessionIds.length - 1
                                  const childGapBefore = isDragging && shouldShowGapBefore(dropIndicator, sid, prevSid)

                                  // Check if this is a file tab
                                  const fileTab = fileTabs.find((f) => f.id === sid)
                                  if (fileTab) {
                                    return (
                                      <div key={fileTab.id}>
                                        <DropGap active={childGapBefore} />
                                        <FileTabItem
                                          fileTab={fileTab}
                                          isSelected={selectedSessionIds.includes(fileTab.id)}
                                          onClick={(modifiers) => handleSessionClick(fileTab.id, modifiers)}
                                          onContextMenu={(e) => handleFileTabContextMenu(e, fileTab.id)}
                                          grouped
                                          groupSelected={allGroupSelected}
                                          forceEditing={renamingId === fileTab.id}
                                          onEditingDone={clearRenaming}
                                          onPointerDown={(e) => handlePointerDown(e, fileTab.id, false)}
                                          isDragging={draggedIds.includes(fileTab.id)}
                                        />
                                        {isLastInGroup && (
                                          <DropGap
                                            active={isDragging && dropIndicator?.targetId === sid && dropIndicator?.position === 'after'}
                                          />
                                        )}
                                      </div>
                                    )
                                  }
                                  const session = sessions.find((s) => s.id === sid)
                                  if (!session) return null
                                  return (
                                    <div key={session.id}>
                                      <DropGap active={childGapBefore} />
                                      <SessionItem
                                        session={session}
                                        isSelected={selectedSessionIds.includes(session.id)}
                                        onClick={(modifiers) => handleSessionClick(session.id, modifiers)}
                                        onContextMenu={(e) => handleSessionContextMenu(e, session.id)}
                                        grouped
                                        groupSelected={allGroupSelected}
                                        groupColorHex={groupColorHex}
                                        forceEditing={renamingId === session.id}
                                        onEditingDone={clearRenaming}
                                        onPointerDown={(e) => handlePointerDown(e, session.id, false)}
                                        isDragging={draggedIds.includes(session.id)}
                                        onDelete={() => setDeleteConfirmSessionId(session.id)}
                                      />
                                      {isLastInGroup && (
                                        <DropGap
                                          active={isDragging && dropIndicator?.targetId === sid && dropIndicator?.position === 'after'}
                                        />
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                        {isLastItem && (
                          <DropGap
                            active={isDragging && dropIndicator?.targetId === itemId && dropIndicator?.position === 'after'}
                          />
                        )}
                      </div>
                    )
                  }
                })}
                {/* Bottom drop zone — generous target for dropping at the very end */}
                {isDragging && <div className="min-h-[60px]" />}
              </>
            ) : null}
          </div>
          </div>
        </div>

        {/* Workflows section */}
        <SectionHeading title="Workflows" collapsed={boardCollapsed} onToggle={() => setBoardCollapsed((c) => !c)} />
        <TaskQueueSection collapsed={boardCollapsed} />
      </ScrollArea>

      {/* User footer */}
      <SidebarFooter />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          header={contextMenu.header}
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

      {/* Reset sessions confirmation */}
      <ConfirmDialog
        isOpen={resetConfirmOpen}
        title="Reset sessions"
        message={
          defaultTemplateName
            ? `Close all sessions and load "${defaultTemplateName}" template?`
            : 'Close all sessions and start fresh?'
        }
        onConfirm={handleResetSessions}
        onCancel={() => setResetConfirmOpen(false)}
      />

      {/* Group terminal configuration dialog */}
      <GroupCommandDialog
        isOpen={terminalDialogState !== null}
        initialCommand={
          terminalDialogState?.terminalId
            ? groups.find((g) => g.id === terminalDialogState.groupId)?.terminals.find((t) => t.id === terminalDialogState.terminalId)?.command
            : undefined
        }
        initialMode={
          terminalDialogState?.terminalId
            ? groups.find((g) => g.id === terminalDialogState.groupId)?.terminals.find((t) => t.id === terminalDialogState.terminalId)?.commandMode ?? 'prefill'
            : 'prefill'
        }
        initialColor={(() => {
          if (terminalDialogState?.terminalId) {
            return groups.find((g) => g.id === terminalDialogState.groupId)?.terminals.find((t) => t.id === terminalDialogState.terminalId)?.color ?? 'blue'
          }
          // Next unused color
          const group = terminalDialogState ? groups.find((g) => g.id === terminalDialogState.groupId) : null
          const used = new Set(group?.terminals.map((t) => t.color) ?? [])
          return (GROUP_TERMINAL_COLORS.find((c) => !used.has(c)) ?? 'blue') as GroupTerminalColor
        })()}
        initialCwd={(() => {
          if (!terminalDialogState) return null
          const group = groups.find((g) => g.id === terminalDialogState.groupId)
          return group?.cwd || sessions.find((s) => group?.sessionIds.includes(s.id))?.cwd || null
        })()}
        initialIcon={
          terminalDialogState?.terminalId
            ? groups.find((g) => g.id === terminalDialogState.groupId)?.terminals.find((t) => t.id === terminalDialogState.terminalId)?.icon ?? 'terminal'
            : 'terminal'
        }
        onSave={async (command, mode, color, cwd, icon) => {
          if (!terminalDialogState) return
          const { groupId, terminalId } = terminalDialogState

          // Update group cwd if changed
          if (cwd) {
            const group = groups.find((g) => g.id === groupId)
            const currentCwd = group?.cwd || sessions.find((s) => group?.sessionIds.includes(s.id))?.cwd
            if (cwd !== currentCwd) {
              setGroupCwd(groupId, cwd)
            }
          }

          if (terminalId) {
            // Editing existing
            useSessionStore.getState().updateGroupTerminal(groupId, terminalId, { command, commandMode: mode, color, icon })
          } else {
            // Adding new — add config, then spawn immediately
            const newId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            addGroupTerminal(groupId, { id: newId, command, commandMode: mode, color, icon })
            setTerminalDialogState(null)
            await spawnGroupTerminal(groupId, newId, command, mode, cwd)
            return
          }
          setTerminalDialogState(null)
        }}
        onCancel={() => setTerminalDialogState(null)}
        onDelete={
          terminalDialogState?.terminalId
            ? () => {
                if (!terminalDialogState) return
                const { groupId, terminalId } = terminalDialogState
                if (terminalId) {
                  // Kill the session if alive
                  const config = groups.find((g) => g.id === groupId)?.terminals.find((t) => t.id === terminalId)
                  if (config?.sessionId) {
                    window.electronAPI.killSession(config.sessionId).catch(() => {})
                  }
                  removeGroupTerminal(groupId, terminalId)
                }
                setTerminalDialogState(null)
              }
            : undefined
        }
      />

      {/* Remote directory picker */}
      {remotePickerState && (
        <RemoteDirectoryPicker
          locationId={remotePickerState.locationId}
          locationName={remotePickerState.locationName}
          onSelect={(path) => {
            spawnRemoteSession(remotePickerState.locationId, path, remotePickerState.claudeMode)
            setRemotePickerState(null)
          }}
          onCancel={() => setRemotePickerState(null)}
        />
      )}
    </div>
  )
}

function PinnedSection({
  setContextMenu,
  pinnedZoneRef,
  isOverPinnedZone,
  draggedGroupId,
  isFileDragOver
}: {
  setContextMenu: (menu: ContextMenuState | null) => void
  pinnedZoneRef: React.RefObject<HTMLDivElement | null>
  isOverPinnedZone: boolean
  draggedGroupId: string | null
  isFileDragOver: boolean
}) {
  const pinnedGroups = usePinnedStore((s) => s.pinnedGroups)
  const pinnedCollapsed = usePinnedStore((s) => s.pinnedCollapsed)
  const togglePinnedCollapsed = usePinnedStore((s) => s.togglePinnedCollapsed)
  const [exportDialogPinnedId, setExportDialogPinnedId] = useState<string | null>(null)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pinnedId: string) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: 'Rename',
            icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
            onClick: () => {
              const pg = usePinnedStore.getState().pinnedGroups.find((p) => p.id === pinnedId)
              const newName = window.prompt('Rename pinned group', pg?.name ?? '')
              if (newName && newName.trim()) {
                usePinnedStore.getState().renamePinnedGroup(pinnedId, newName.trim())
              }
            }
          },
          {
            label: 'Export as .clave',
            icon: <ArrowDownTrayIcon className="w-3.5 h-3.5" />,
            onClick: () => setExportDialogPinnedId(pinnedId)
          },
          {
            label: 'Remove Pin',
            icon: <TrashIcon className="w-3.5 h-3.5" />,
            danger: true,
            onClick: () => removePinnedGroupWithCleanup(pinnedId)
          }
        ]
      })
    },
    [setContextMenu]
  )

  // Show pinned section when there are pins, dragging a group, or dragging a .clave file
  const showSection = pinnedGroups.length > 0 || !!draggedGroupId || isFileDragOver

  if (!showSection) return null

  return (
    <>
      <SectionHeading
        title="Pinned"
        collapsed={pinnedCollapsed}
        onToggle={togglePinnedCollapsed}
      />
      <PinnedGroupsGrid
        ref={pinnedZoneRef}
        collapsed={pinnedCollapsed}
        onContextMenu={handleContextMenu}
        isOverPinnedZone={isOverPinnedZone}
        draggedGroupId={draggedGroupId}
        isFileDragOver={isFileDragOver}
      />
      <ExportClaveDialog
        isOpen={exportDialogPinnedId !== null}
        defaultFileName={exportDialogPinnedId ? getExportFileName(exportDialogPinnedId) : 'group.clave'}
        onExport={async (folder, fileName, keepSynced) => {
          if (exportDialogPinnedId) {
            await exportClaveFile(exportDialogPinnedId, folder, fileName, keepSynced)
          }
          setExportDialogPinnedId(null)
        }}
        onCancel={() => setExportDialogPinnedId(null)}
      />
    </>
  )
}
