# Kanban Board Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat task queue with a column-based kanban board where tasks persist through their lifecycle and can be organized into configurable columns.

**Architecture:** Extend the existing BoardData model with columns (typed by behavior) and task ordering. Rewrite the flat-list UI as a horizontal column layout with drag-and-drop cards. The run-task flow moves cards to the "active" column instead of deleting them.

**Tech Stack:** TypeScript, React 19, Zustand 5, Tailwind CSS v4, Framer Motion, Radix UI, Electron IPC. No new dependencies.

**Spec:** `docs/features/kanban-board/spec.md`

**Validation:** This project has no test framework. Validation is `npm run typecheck && npm run lint` plus manual testing via `npm run dev`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/preload/index.d.ts:108-120` | Modify: Add `BoardColumn`, `ColumnBehavior` types; extend `BoardTask` and `BoardData` |
| `src/main/board-manager.ts` | Modify: Add default column creation, migration logic for existing data |
| `src/renderer/src/store/board-store.ts` | Modify: Add columns state, moveTask, column CRUD, behavior queries |
| `src/renderer/src/components/board/KanbanBoard.tsx` | Modify: Rewrite as horizontal column layout (keep `TaskQueue` export) |
| `src/renderer/src/components/board/KanbanColumn.tsx` | Create: Single column component — header, card list, add button |
| `src/renderer/src/components/board/KanbanCard.tsx` | Create: Task card — title, notes preview, prompt indicator, badges |
| `src/renderer/src/components/board/TaskDetailPanel.tsx` | Create: Modal for editing all task fields (notes, prompt, folder, etc.) |
| `src/renderer/src/components/board/TaskForm.tsx` | Modify: Add notes field, columnId param, reorder fields |
| `src/renderer/src/hooks/use-board-dnd.ts` | Create: Hand-rolled drag-drop for cards between columns |
| `src/renderer/src/components/layout/SidebarSections.tsx:36-109` | Modify: Filter out terminal-behavior column tasks, show column-grouped counts |

---

## Task 1: Extend Type Definitions

**Files:**
- Modify: `src/preload/index.d.ts:108-120`

- [ ] **Step 1: Add ColumnBehavior type and BoardColumn interface**

In `src/preload/index.d.ts`, replace the existing `BoardTask` and `BoardData` interfaces (lines 108-120) with:

```typescript
export type ColumnBehavior = 'default-inbox' | 'active' | 'terminal' | 'none'

export interface BoardColumn {
  id: string
  title: string
  order: number
  builtIn: boolean
  behavior: ColumnBehavior
  locked?: boolean
  color?: string
}

export interface BoardTask {
  id: string
  title: string
  prompt: string
  notes: string
  cwd: string
  dangerousMode: boolean
  createdAt: number
  updatedAt: number
  columnId: string
  order: number
  sessionId?: string
}

export interface BoardData {
  tasks: BoardTask[]
  columns: BoardColumn[]
}
```

- [ ] **Step 2: Run typecheck to see what breaks**

Run: `npm run typecheck`

Expected: Errors in `board-manager.ts`, `board-store.ts`, `KanbanBoard.tsx`, `TaskForm.tsx`, and `SidebarSections.tsx` because they don't supply the new required fields (`notes`, `columnId`, `order`, `columns`). This confirms the types propagated correctly.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.d.ts
git commit -m "feat(board): extend type definitions with columns, behaviors, and task notes"
```

---

## Task 2: Update Board Manager with Migration

**Files:**
- Modify: `src/main/board-manager.ts`

- [ ] **Step 1: Add default columns constant and update types import**

Replace the entire content of `src/main/board-manager.ts` with:

```typescript
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export type ColumnBehavior = 'default-inbox' | 'active' | 'terminal' | 'none'

export interface BoardColumn {
  id: string
  title: string
  order: number
  builtIn: boolean
  behavior: ColumnBehavior
  locked?: boolean
  color?: string
}

export interface BoardTask {
  id: string
  title: string
  prompt: string
  notes: string
  cwd: string
  dangerousMode: boolean
  createdAt: number
  updatedAt: number
  columnId: string
  order: number
  sessionId?: string
}

export interface BoardData {
  tasks: BoardTask[]
  columns: BoardColumn[]
}

function createDefaultColumns(): BoardColumn[] {
  return [
    { id: crypto.randomUUID(), title: 'Backlog', order: 0, builtIn: true, behavior: 'default-inbox' },
    { id: crypto.randomUUID(), title: 'Ready', order: 1, builtIn: true, behavior: 'none' },
    { id: crypto.randomUUID(), title: 'Running', order: 2, builtIn: true, behavior: 'active' },
    { id: crypto.randomUUID(), title: 'Done', order: 3, builtIn: true, behavior: 'terminal' }
  ]
}

class BoardManager {
  private filePath: string

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'board.json')
  }

  load(): BoardData {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as Record<string, unknown>

      // Ensure columns exist (migration from flat task list)
      let columns: BoardColumn[]
      if (Array.isArray(data.columns) && data.columns.length > 0) {
        columns = data.columns as BoardColumn[]
      } else {
        columns = createDefaultColumns()
      }

      const inboxColumn = columns.find((c) => c.behavior === 'default-inbox') ?? columns[0]

      // Migrate tasks: filter old kanban statuses, add new fields
      const rawTasks = (data.tasks ?? []) as Array<Record<string, unknown>>
      const tasks: BoardTask[] = rawTasks
        .filter((t) => !t.status || t.status === 'todo')
        .map((t, index) => ({
          id: t.id as string,
          title: (t.title as string) ?? '',
          prompt: (t.prompt as string) ?? '',
          notes: (t.notes as string) ?? '',
          cwd: t.cwd as string,
          dangerousMode: t.dangerousMode === true,
          createdAt: t.createdAt as number,
          updatedAt: t.updatedAt as number,
          columnId: (t.columnId as string) ?? inboxColumn.id,
          order: typeof t.order === 'number' ? (t.order as number) : index,
          sessionId: (t.sessionId as string) ?? undefined
        }))

      return { tasks, columns }
    } catch {
      return { tasks: [], columns: createDefaultColumns() }
    }
  }

  save(data: BoardData): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }
}

export const boardManager = new BoardManager()
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: `board-manager.ts` passes. Errors remain in renderer files (store, components).

- [ ] **Step 3: Commit**

```bash
git add src/main/board-manager.ts
git commit -m "feat(board): add column migration and default column creation to board manager"
```

---

## Task 3: Rewrite Board Store

**Files:**
- Modify: `src/renderer/src/store/board-store.ts`

- [ ] **Step 1: Rewrite the store with columns, moveTask, and column CRUD**

Replace the entire content of `src/renderer/src/store/board-store.ts` with:

```typescript
import { create } from 'zustand'
import type { BoardTask, BoardData, BoardColumn, ColumnBehavior } from '../../../preload/index.d'

interface BoardState {
  tasks: BoardTask[]
  columns: BoardColumn[]
  loaded: boolean

  loadBoard: () => Promise<void>
  addTask: (task: Omit<BoardTask, 'id' | 'createdAt' | 'updatedAt' | 'columnId' | 'order'> & { columnId?: string }) => void
  updateTask: (id: string, updates: Partial<Pick<BoardTask, 'title' | 'prompt' | 'notes' | 'cwd' | 'dangerousMode' | 'sessionId'>>) => void
  deleteTask: (id: string) => void
  moveTask: (taskId: string, toColumnId: string, toOrder: number) => void

  addColumn: (title: string, afterColumnId?: string) => void
  updateColumn: (id: string, updates: Partial<Pick<BoardColumn, 'title' | 'color'>>) => void
  deleteColumn: (id: string) => void
  reorderColumns: (columnIds: string[]) => void

  getColumnByBehavior: (behavior: ColumnBehavior) => BoardColumn | undefined
  getInboxColumn: () => BoardColumn
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(state: { tasks: BoardTask[]; columns: BoardColumn[] }): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: BoardData = { tasks: state.tasks, columns: state.columns }
    window.electronAPI?.boardSave?.(data)
  }, 300)
}

export const useBoardStore = create<BoardState>((set, get) => ({
  tasks: [],
  columns: [],
  loaded: false,

  loadBoard: async () => {
    if (!window.electronAPI?.boardLoad) return
    const data = await window.electronAPI.boardLoad()
    set({ tasks: data.tasks, columns: data.columns, loaded: true })
  },

  addTask: (partial) => {
    const state = get()
    const inbox = state.getInboxColumn()
    const columnId = partial.columnId ?? inbox.id
    const tasksInColumn = state.tasks.filter((t) => t.columnId === columnId)
    const now = Date.now()
    const task: BoardTask = {
      id: crypto.randomUUID(),
      title: partial.title,
      prompt: partial.prompt,
      notes: partial.notes,
      cwd: partial.cwd,
      dangerousMode: partial.dangerousMode,
      createdAt: now,
      updatedAt: now,
      columnId,
      order: tasksInColumn.length,
      sessionId: undefined
    }
    const newTasks = [...state.tasks, task]
    set({ tasks: newTasks })
    debouncedSave({ tasks: newTasks, columns: state.columns })
  },

  updateTask: (id, updates) => {
    const state = get()
    const newTasks = state.tasks.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave({ tasks: newTasks, columns: state.columns })
  },

  deleteTask: (id) => {
    const state = get()
    const newTasks = state.tasks.filter((t) => t.id !== id)
    set({ tasks: newTasks })
    debouncedSave({ tasks: newTasks, columns: state.columns })
  },

  moveTask: (taskId, toColumnId, toOrder) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === taskId)
    if (!task) return

    const fromColumnId = task.columnId

    // Remove from current position and reindex source column
    let newTasks = state.tasks.filter((t) => t.id !== taskId)
    if (fromColumnId !== toColumnId) {
      newTasks = newTasks.map((t) =>
        t.columnId === fromColumnId && t.order > task.order
          ? { ...t, order: t.order - 1 }
          : t
      )
    }

    // Make space at target position
    newTasks = newTasks.map((t) =>
      t.columnId === toColumnId && t.order >= toOrder
        ? { ...t, order: t.order + 1 }
        : t
    )

    // Insert at new position
    newTasks.push({
      ...task,
      columnId: toColumnId,
      order: toOrder,
      updatedAt: Date.now()
    })

    set({ tasks: newTasks })
    debouncedSave({ tasks: newTasks, columns: state.columns })
  },

  addColumn: (title, afterColumnId) => {
    const state = get()
    let insertOrder: number
    if (afterColumnId) {
      const afterCol = state.columns.find((c) => c.id === afterColumnId)
      insertOrder = afterCol ? afterCol.order + 1 : state.columns.length
    } else {
      insertOrder = state.columns.length
    }

    const newColumns = state.columns.map((c) =>
      c.order >= insertOrder ? { ...c, order: c.order + 1 } : c
    )

    newColumns.push({
      id: crypto.randomUUID(),
      title,
      order: insertOrder,
      builtIn: false,
      behavior: 'none' as ColumnBehavior
    })

    set({ columns: newColumns })
    debouncedSave({ tasks: state.tasks, columns: newColumns })
  },

  updateColumn: (id, updates) => {
    const state = get()
    const newColumns = state.columns.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    )
    set({ columns: newColumns })
    debouncedSave({ tasks: state.tasks, columns: newColumns })
  },

  deleteColumn: (id) => {
    const state = get()
    const column = state.columns.find((c) => c.id === id)
    if (!column) return
    if (column.locked) return

    const inbox = state.getInboxColumn()

    // If deleting the inbox column itself, pick the first remaining column
    const remainingColumns = state.columns.filter((c) => c.id !== id)
    if (remainingColumns.length === 0) return // can't delete last column

    const targetColumnId = column.id === inbox.id
      ? remainingColumns.sort((a, b) => a.order - b.order)[0].id
      : inbox.id

    // Move orphaned tasks to target column
    const targetTaskCount = state.tasks.filter((t) => t.columnId === targetColumnId).length
    const newTasks = state.tasks.map((t, idx) =>
      t.columnId === id
        ? { ...t, columnId: targetColumnId, order: targetTaskCount + idx, updatedAt: Date.now() }
        : t
    )

    // Reindex column orders
    const newColumns = remainingColumns
      .sort((a, b) => a.order - b.order)
      .map((c, i) => ({ ...c, order: i }))

    set({ tasks: newTasks, columns: newColumns })
    debouncedSave({ tasks: newTasks, columns: newColumns })
  },

  reorderColumns: (columnIds) => {
    const state = get()
    const newColumns = state.columns.map((c) => {
      const newOrder = columnIds.indexOf(c.id)
      return newOrder >= 0 ? { ...c, order: newOrder } : c
    })
    set({ columns: newColumns })
    debouncedSave({ tasks: state.tasks, columns: newColumns })
  },

  getColumnByBehavior: (behavior) => {
    return get().columns.find((c) => c.behavior === behavior)
  },

  getInboxColumn: () => {
    const state = get()
    return state.columns.find((c) => c.behavior === 'default-inbox') ?? state.columns.sort((a, b) => a.order - b.order)[0]
  }
}))
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: Store compiles cleanly. Errors remain in UI components that still use old APIs (`removeTask`, old `addTask` signature, etc.).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/board-store.ts
git commit -m "feat(board): rewrite board store with columns, moveTask, and behavior queries"
```

---

## Task 4: Create KanbanCard Component

**Files:**
- Create: `src/renderer/src/components/board/KanbanCard.tsx`

- [ ] **Step 1: Create the card component**

Create `src/renderer/src/components/board/KanbanCard.tsx`:

```typescript
import { FolderIcon, CommandLineIcon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'
import type { BoardTask, BoardColumn } from '../../../../preload/index.d'

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
  isDragging?: boolean
}

export function KanbanCard({ task, column, onRun, onClick, onContextMenu, isDragging }: KanbanCardProps) {
  const label = task.title || task.notes.split('\n')[0] || task.prompt.split('\n')[0] || 'Untitled'
  const canRun = column.behavior !== 'terminal' && column.behavior !== 'active'
  const hasPrompt = task.prompt.trim().length > 0
  const notesPreview = task.notes.trim() ? task.notes.split('\n').slice(0, 2).join(' ') : null

  return (
    <div
      data-task-id={task.id}
      onClick={() => onClick(task)}
      onContextMenu={(e) => onContextMenu(e, task)}
      className={cn(
        'group rounded-lg border border-border-subtle bg-surface-100 p-3 cursor-default transition-all hover:border-border hover:shadow-sm',
        isDragging && 'opacity-40'
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

      {/* Metadata row */}
      <div className="flex items-center gap-2 mt-2">
        {hasPrompt && (
          <span className="flex items-center gap-1 text-[10px] text-accent/70" title="Has prompt">
            <CommandLineIcon className="w-3 h-3" />
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <FolderIcon className="w-3 h-3" />
          <span className="truncate max-w-[120px]" title={task.cwd}>{shortenCwd(task.cwd)}</span>
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
            Run
          </button>
        </div>
      )}

      {/* Active session indicator */}
      {task.sessionId && column.behavior === 'active' && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[11px] text-green-400">Running</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: New file compiles cleanly (it has no consumers yet, just imports from types).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/board/KanbanCard.tsx
git commit -m "feat(board): add KanbanCard component"
```

---

## Task 5: Create KanbanColumn Component

**Files:**
- Create: `src/renderer/src/components/board/KanbanColumn.tsx`

- [ ] **Step 1: Create the column component**

Create `src/renderer/src/components/board/KanbanColumn.tsx`:

```typescript
import { useState, useCallback } from 'react'
import { PlusIcon, EllipsisHorizontalIcon, InboxIcon, PlayIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { KanbanCard } from './KanbanCard'
import { ContextMenu } from '../ui/ContextMenu'
import { cn } from '../../lib/utils'
import type { BoardTask, BoardColumn as BoardColumnType } from '../../../../preload/index.d'

const BEHAVIOR_ICONS: Record<string, typeof InboxIcon> = {
  'default-inbox': InboxIcon,
  'active': PlayIcon,
  'terminal': CheckCircleIcon
}

interface KanbanColumnProps {
  column: BoardColumnType
  tasks: BoardTask[]
  onAddTask: (columnId: string) => void
  onRunTask: (task: BoardTask) => void
  onClickTask: (task: BoardTask) => void
  onContextMenuTask: (e: React.MouseEvent, task: BoardTask) => void
  onRenameColumn: (columnId: string, title: string) => void
  onDeleteColumn: (columnId: string) => void
  onAddColumnAfter: (columnId: string) => void
  isOnlyInbox: boolean
  dragOverState?: 'above' | 'below' | null
}

export function KanbanColumn({
  column,
  tasks,
  onAddTask,
  onRunTask,
  onClickTask,
  onContextMenuTask,
  onRenameColumn,
  onDeleteColumn,
  onAddColumnAfter,
  isOnlyInbox,
  dragOverState
}: KanbanColumnProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(column.title)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order)
  const BehaviorIcon = BEHAVIOR_ICONS[column.behavior]
  const canDelete = !column.locked && !(column.behavior === 'default-inbox' && isOnlyInbox)

  const commitRename = useCallback(() => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== column.title) {
      onRenameColumn(column.id, trimmed)
    } else {
      setEditTitle(column.title)
    }
    setIsEditingTitle(false)
  }, [editTitle, column.id, column.title, onRenameColumn])

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div
      data-column-id={column.id}
      className={cn(
        'flex flex-col w-72 flex-shrink-0 rounded-xl bg-surface-50 border border-border-subtle',
        dragOverState && 'ring-2 ring-accent/40'
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
        {BehaviorIcon && (
          <BehaviorIcon className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
        )}

        {isEditingTitle ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setEditTitle(column.title)
                setIsEditingTitle(false)
              }
            }}
            className="flex-1 text-sm font-semibold text-text-primary bg-transparent outline-none border-b border-accent"
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold text-text-primary cursor-text truncate"
            onClick={() => {
              setEditTitle(column.title)
              setIsEditingTitle(true)
            }}
          >
            {column.title}
          </span>
        )}

        <span className="text-xs text-text-tertiary tabular-nums">{sortedTasks.length}</span>

        <button
          onClick={handleMenuClick}
          className="p-0.5 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <EllipsisHorizontalIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
        {sortedTasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            column={column}
            onRun={onRunTask}
            onClick={onClickTask}
            onContextMenu={onContextMenuTask}
          />
        ))}

        {/* Drop zone indicator at bottom */}
        {sortedTasks.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-text-tertiary">
            No tasks
          </div>
        )}
      </div>

      {/* Add task button at column bottom */}
      <button
        onClick={() => onAddTask(column.id)}
        className="flex items-center gap-1.5 mx-2 mb-2 px-2 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-100 transition-colors"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        Add task
      </button>

      {/* Column context menu */}
      {menuPos && (
        <ContextMenu
          items={[
            {
              label: 'Rename',
              onClick: () => {
                setEditTitle(column.title)
                setIsEditingTitle(true)
              }
            },
            {
              label: 'Add column after',
              onClick: () => onAddColumnAfter(column.id)
            },
            ...(canDelete
              ? [{ label: 'Delete column', onClick: () => onDeleteColumn(column.id), danger: true }]
              : [])
          ]}
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: Compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/board/KanbanColumn.tsx
git commit -m "feat(board): add KanbanColumn component with header, card list, and context menu"
```

---

## Task 6: Create TaskDetailPanel Component

**Files:**
- Create: `src/renderer/src/components/board/TaskDetailPanel.tsx`

- [ ] **Step 1: Create the detail panel**

Create `src/renderer/src/components/board/TaskDetailPanel.tsx`:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '../../store/board-store'
import type { BoardTask } from '../../../../preload/index.d'

function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

interface TaskDetailPanelProps {
  task: BoardTask | null
  onClose: () => void
}

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const updateTask = useBoardStore((s) => s.updateTask)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cwd, setCwd] = useState('')
  const [dangerousMode, setDangerousMode] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNotes(task.notes)
      setPrompt(task.prompt)
      setCwd(task.cwd)
      setDangerousMode(task.dangerousMode)
    }
  }, [task])

  const save = useCallback(() => {
    if (!task) return
    updateTask(task.id, {
      title: title.trim(),
      notes: notes.trim(),
      prompt: prompt.trim(),
      cwd: cwd.trim(),
      dangerousMode
    })
  }, [task, title, notes, prompt, cwd, dangerousMode, updateTask])

  // Auto-save on blur of any field
  const handleBlur = useCallback(() => {
    save()
  }, [save])

  const handlePickFolder = useCallback(async () => {
    const folder = await window.electronAPI?.openFolderDialog()
    if (folder) {
      setCwd(folder)
      if (task) updateTask(task.id, { cwd: folder })
    }
  }, [task, updateTask])

  useEffect(() => {
    if (!task) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        save()
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [task, save, onClose])

  return (
    <AnimatePresence>
      {task && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={() => {
              save()
              onClose()
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="fixed z-50 left-1/2 -translate-x-1/2 w-[560px] max-h-[80vh] overflow-y-auto"
            style={{ top: '10%' }}
          >
            <div className="bg-surface-100 rounded-xl border border-border shadow-2xl overflow-hidden">
              <div className="px-5 pt-4 pb-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleBlur}
                  placeholder="Task title"
                  className="w-full text-base font-semibold text-text-primary bg-transparent outline-none placeholder:text-text-tertiary"
                />
              </div>

              <div className="px-5 space-y-4 pb-5">
                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Notes</label>
                  <textarea
                    ref={notesRef}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="Context, reasoning, acceptance criteria, links..."
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors resize-y"
                  />
                </div>

                {/* Prompt */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Prompt <span className="font-normal text-text-tertiary">(sent to Claude Code on run)</span>
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="Instructions for Claude Code..."
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors resize-y font-mono"
                  />
                </div>

                {/* Folder */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Folder</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cwd}
                      readOnly
                      placeholder="Select a folder..."
                      className="flex-1 h-8 px-3 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none cursor-default truncate"
                    />
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      className="h-8 px-3 rounded-lg bg-surface-200 hover:bg-surface-300 text-text-secondary hover:text-text-primary text-xs font-medium transition-colors flex-shrink-0"
                    >
                      Browse
                    </button>
                  </div>
                </div>

                {/* Danger mode */}
                <label className="flex items-center gap-2 cursor-pointer group">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dangerousMode}
                    onClick={() => {
                      setDangerousMode(!dangerousMode)
                      if (task) updateTask(task.id, { dangerousMode: !dangerousMode })
                    }}
                    className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${dangerousMode ? 'bg-red-500' : 'bg-surface-300'}`}
                  >
                    <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${dangerousMode ? 'translate-x-[14px]' : ''}`} />
                  </button>
                  <span className={`text-xs transition-colors ${dangerousMode ? 'text-red-400' : 'text-text-secondary group-hover:text-text-primary'}`}>
                    Skip permissions
                  </span>
                </label>

                {/* Metadata */}
                <div className="pt-2 border-t border-border-subtle text-[11px] text-text-tertiary space-y-0.5">
                  <div>Created {formatFullDate(task.createdAt)}</div>
                  <div>Updated {formatFullDate(task.updatedAt)}</div>
                  {task.sessionId && <div>Linked session: {task.sessionId.slice(0, 8)}...</div>}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border-subtle flex justify-end">
                <button
                  onClick={() => {
                    save()
                    onClose()
                  }}
                  className="h-7 px-4 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: Compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/board/TaskDetailPanel.tsx
git commit -m "feat(board): add TaskDetailPanel for editing task notes, prompt, and metadata"
```

---

## Task 7: Update TaskForm for New Fields

**Files:**
- Modify: `src/renderer/src/components/board/TaskForm.tsx`

- [ ] **Step 1: Update TaskForm to include notes field and columnId**

Replace the entire content of `src/renderer/src/components/board/TaskForm.tsx` with:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '../../store/board-store'

interface TaskFormProps {
  isOpen: boolean
  onClose: () => void
  columnId?: string
  editTask?: { id: string; title: string; prompt: string; notes: string; cwd: string; dangerousMode: boolean } | null
}

export function TaskForm({ isOpen, onClose, columnId, editTask }: TaskFormProps) {
  const addTask = useBoardStore((s) => s.addTask)
  const updateTask = useBoardStore((s) => s.updateTask)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cwd, setCwd] = useState('')
  const [dangerousMode, setDangerousMode] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      if (editTask) {
        setTitle(editTask.title)
        setNotes(editTask.notes)
        setPrompt(editTask.prompt)
        setCwd(editTask.cwd)
        setDangerousMode(editTask.dangerousMode)
      } else {
        setTitle('')
        setNotes('')
        setPrompt('')
        setCwd('')
        setDangerousMode(false)
      }
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [isOpen, editTask])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handlePickFolder = useCallback(async () => {
    const folder = await window.electronAPI?.openFolderDialog()
    if (folder) setCwd(folder)
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!cwd.trim()) return
      // Allow creation without prompt — notes-only tasks are valid

      if (editTask) {
        updateTask(editTask.id, {
          title: title.trim(),
          notes: notes.trim(),
          prompt: prompt.trim(),
          cwd: cwd.trim(),
          dangerousMode
        })
      } else {
        addTask({
          title: title.trim(),
          notes: notes.trim(),
          prompt: prompt.trim(),
          cwd: cwd.trim(),
          dangerousMode,
          columnId
        })
      }
      onClose()
    },
    [title, notes, prompt, cwd, dangerousMode, columnId, editTask, addTask, updateTask, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        handleSubmit(e as unknown as React.FormEvent)
      }
    },
    [handleSubmit]
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="fixed z-50 left-1/2 -translate-x-1/2 w-[480px]"
            style={{ top: '15%' }}
          >
            <form
              onSubmit={handleSubmit}
              onKeyDown={handleKeyDown}
              className="bg-surface-100 rounded-xl border border-border shadow-2xl overflow-hidden"
            >
              <div className="px-5 pt-4 pb-3">
                <h2 className="text-sm font-semibold text-text-primary">
                  {editTask ? 'Edit Task' : 'New Task'}
                </h2>
              </div>

              <div className="px-5 space-y-3 pb-4">
                {/* Title */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Title</label>
                  <input
                    ref={titleRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Short label for the task"
                    className="w-full h-8 px-3 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Context, reasoning, acceptance criteria..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors resize-none"
                  />
                </div>

                {/* Prompt */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Prompt <span className="text-text-tertiary">(optional — required to run)</span>
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Instructions for Claude Code..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors resize-none font-mono"
                  />
                </div>

                {/* Folder */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Folder</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cwd}
                      readOnly
                      placeholder="Select a folder..."
                      className="flex-1 h-8 px-3 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none cursor-default truncate"
                    />
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      className="h-8 px-3 rounded-lg bg-surface-200 hover:bg-surface-300 text-text-secondary hover:text-text-primary text-xs font-medium transition-colors flex-shrink-0"
                    >
                      Browse
                    </button>
                  </div>
                </div>

                {/* Danger mode */}
                <label className="flex items-center gap-2 cursor-pointer group">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dangerousMode}
                    onClick={() => setDangerousMode(!dangerousMode)}
                    className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${dangerousMode ? 'bg-red-500' : 'bg-surface-300'}`}
                  >
                    <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${dangerousMode ? 'translate-x-[14px]' : ''}`} />
                  </button>
                  <span className={`text-xs transition-colors ${dangerousMode ? 'text-red-400' : 'text-text-secondary group-hover:text-text-primary'}`}>
                    Skip permissions
                  </span>
                </label>
              </div>

              <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between">
                <span className="text-[11px] text-text-tertiary">
                  <kbd className="px-1 py-0.5 rounded bg-surface-200 text-text-secondary">Cmd+Enter</kbd> submit
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-7 px-3 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!cwd.trim()}
                    className="h-7 px-4 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {editTask ? 'Save' : 'Create'}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: Compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/board/TaskForm.tsx
git commit -m "feat(board): update TaskForm with notes field, columnId support, title-first field order"
```

---

## Task 8: Rewrite KanbanBoard as Column Layout

**Files:**
- Modify: `src/renderer/src/components/board/KanbanBoard.tsx`

- [ ] **Step 1: Rewrite as horizontal column layout**

Replace the entire content of `src/renderer/src/components/board/KanbanBoard.tsx` with:

```typescript
import { useState, useCallback, useMemo } from 'react'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useBoardStore } from '../../store/board-store'
import { useSessionStore } from '../../store/session-store'
import { useBoardPersistence } from '../../hooks/use-board-persistence'
import { KanbanColumn } from './KanbanColumn'
import { TaskForm } from './TaskForm'
import { TaskDetailPanel } from './TaskDetailPanel'
import { ContextMenu } from '../ui/ContextMenu'
import type { BoardTask } from '../../../../preload/index.d'

export function TaskQueue() {
  const tasks = useBoardStore((s) => s.tasks)
  const columns = useBoardStore((s) => s.columns)
  const deleteTask = useBoardStore((s) => s.deleteTask)
  const moveTask = useBoardStore((s) => s.moveTask)
  const updateTask = useBoardStore((s) => s.updateTask)
  const addColumn = useBoardStore((s) => s.addColumn)
  const updateColumn = useBoardStore((s) => s.updateColumn)
  const deleteColumn = useBoardStore((s) => s.deleteColumn)
  const getColumnByBehavior = useBoardStore((s) => s.getColumnByBehavior)

  const addSession = useSessionStore((s) => s.addSession)

  useBoardPersistence()

  const [formOpen, setFormOpen] = useState(false)
  const [formColumnId, setFormColumnId] = useState<string | undefined>(undefined)
  const [editTask, setEditTask] = useState<BoardTask | null>(null)
  const [detailTask, setDetailTask] = useState<BoardTask | null>(null)
  const [search, setSearch] = useState('')

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number
    items: { label: string; onClick: () => void; danger?: boolean }[]
  } | null>(null)

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.order - b.order),
    [columns]
  )

  const inboxColumnCount = useMemo(
    () => columns.filter((c) => c.behavior === 'default-inbox').length,
    [columns]
  )

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks
    const q = search.toLowerCase()
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q) ||
        t.cwd.toLowerCase().includes(q)
    )
  }, [tasks, search])

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, BoardTask[]>()
    for (const col of columns) {
      map.set(col.id, [])
    }
    for (const task of filteredTasks) {
      const arr = map.get(task.columnId)
      if (arr) arr.push(task)
    }
    return map
  }, [columns, filteredTasks])

  const handleAddTask = useCallback((columnId: string) => {
    setEditTask(null)
    setFormColumnId(columnId)
    setFormOpen(true)
  }, [])

  const handleEditTask = useCallback((task: BoardTask) => {
    setEditTask(task)
    setFormColumnId(undefined)
    setFormOpen(true)
  }, [])

  const handleCloseForm = useCallback(() => {
    setFormOpen(false)
    setEditTask(null)
    setFormColumnId(undefined)
  }, [])

  const handleClickTask = useCallback((task: BoardTask) => {
    // Refresh from store in case task was updated
    const current = useBoardStore.getState().tasks.find((t) => t.id === task.id)
    setDetailTask(current ?? task)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setDetailTask(null)
  }, [])

  const handleContextMenuTask = useCallback(
    (e: React.MouseEvent, task: BoardTask) => {
      e.preventDefault()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Edit', onClick: () => handleEditTask(task) },
          { label: 'Delete', onClick: () => deleteTask(task.id), danger: true }
        ]
      })
    },
    [handleEditTask, deleteTask]
  )

  const runTask = useCallback(
    async (task: BoardTask) => {
      if (!task.prompt.trim()) {
        // No prompt yet — open detail panel so user can write one
        const current = useBoardStore.getState().tasks.find((t) => t.id === task.id)
        setDetailTask(current ?? task)
        return
      }

      if (!window.electronAPI?.spawnSession) return

      const dangerousMode = task.dangerousMode ?? false
      const sessionInfo = await window.electronAPI.spawnSession(task.cwd, {
        dangerousMode,
        claudeMode: true
      })

      addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: task.title || task.prompt.slice(0, 40),
        alive: sessionInfo.alive,
        activityStatus: 'idle',
        promptWaiting: null,
        claudeMode: true,
        dangerousMode,
        claudeSessionId: sessionInfo.claudeSessionId,
        sessionType: 'local'
      })

      // Move to active column instead of deleting
      const activeCol = getColumnByBehavior('active')
      if (activeCol) {
        moveTask(task.id, activeCol.id, 0)
      }
      updateTask(task.id, { sessionId: sessionInfo.id })

      useSessionStore.getState().selectSession(sessionInfo.id, false)

      if (task.prompt) {
        let sent = false
        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        const sendPrompt = (): void => {
          if (sent) return
          sent = true
          if (debounceTimer) clearTimeout(debounceTimer)
          window.electronAPI?.writeSession(sessionInfo.id, task.prompt)
          setTimeout(() => {
            window.electronAPI?.writeSession(sessionInfo.id, '\r')
          }, 150)
          cleanup?.()
        }

        const cleanup = window.electronAPI?.onSessionData(sessionInfo.id, () => {
          if (sent) return
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(sendPrompt, 2000)
        })

        setTimeout(sendPrompt, 20000)
      }
    },
    [addSession, moveTask, updateTask, getColumnByBehavior]
  )

  const handleAddNewColumn = useCallback(() => {
    addColumn('New Column')
  }, [addColumn])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-0">
      {/* Top bar: search + global add */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle flex-shrink-0">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full h-7 pl-8 pr-3 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
          />
        </div>
      </div>

      {/* Board: horizontal scrolling columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full items-start">
          {sortedColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn.get(column.id) ?? []}
              onAddTask={handleAddTask}
              onRunTask={runTask}
              onClickTask={handleClickTask}
              onContextMenuTask={handleContextMenuTask}
              onRenameColumn={(id, title) => updateColumn(id, { title })}
              onDeleteColumn={deleteColumn}
              onAddColumnAfter={(id) => addColumn('New Column', id)}
              isOnlyInbox={inboxColumnCount <= 1}
            />
          ))}

          {/* Add column button */}
          <button
            onClick={handleAddNewColumn}
            className="w-72 flex-shrink-0 h-12 rounded-xl border-2 border-dashed border-border-subtle hover:border-border text-text-tertiary hover:text-text-secondary flex items-center justify-center gap-2 text-sm transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Column
          </button>
        </div>
      </div>

      <TaskForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        columnId={formColumnId}
        editTask={editTask}
      />

      <TaskDetailPanel
        task={detailTask}
        onClose={handleCloseDetail}
      />

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
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: Should compile. If there are errors, they'll be about `addSession` parameter types — check that the session fields match the `addSession` signature in `session-store.ts` and adjust.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/board/KanbanBoard.tsx
git commit -m "feat(board): rewrite KanbanBoard as horizontal column layout with run-moves-to-active flow"
```

---

## Task 9: Update Sidebar Section

**Files:**
- Modify: `src/renderer/src/components/layout/SidebarSections.tsx:36-109`

- [ ] **Step 1: Update TaskQueueSection to filter terminal tasks and show column-grouped counts**

In `src/renderer/src/components/layout/SidebarSections.tsx`, replace the `TaskQueueSection` function (lines 36-109) with:

```typescript
export function TaskQueueSection({ collapsed }: { collapsed: boolean }) {
  const activeView = useSessionStore((s) => s.activeView)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const tasks = useBoardStore((s) => s.tasks)
  const columns = useBoardStore((s) => s.columns)
  const [expanded, setExpanded] = useState(false)

  // Hide tasks in terminal columns (e.g., "Done") from sidebar count
  const terminalColumnIds = useMemo(
    () => new Set(columns.filter((c) => c.behavior === 'terminal').map((c) => c.id)),
    [columns]
  )
  const activeTasks = useMemo(
    () => tasks.filter((t) => !terminalColumnIds.has(t.columnId)),
    [tasks, terminalColumnIds]
  )

  return (
    <Collapsible open={!collapsed} className="flex-shrink-0">
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
        <div className="px-2 pt-0.5 pb-2">
          {/* Queue row — clickable to navigate, chevron to expand sub-items */}
          <button
            onClick={() => setActiveView('board')}
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
              activeView === 'board'
                ? 'bg-surface-200 text-text-primary shadow-[0_0_0.5px_rgba(0,0,0,0.12)]'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-100'
            )}
          >
            <QueueListIcon className="flex-shrink-0 w-4 h-4 text-text-tertiary" />
            <span className="truncate">Board</span>
            {activeTasks.length > 0 && (
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-[12px] text-text-tertiary">{activeTasks.length}</span>
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpanded((v) => !v)
                  }}
                  className="p-0.5 rounded hover:bg-surface-300/50 transition-colors"
                >
                  <ChevronRightIcon
                    className={cn(
                      'w-3 h-3 text-text-tertiary transition-transform duration-150',
                      expanded ? 'rotate-90' : 'rotate-0'
                    )}
                  />
                </span>
              </span>
            )}
          </button>

          {/* Expanded sub-items: non-terminal tasks with vertical connecting line */}
          {expanded && activeTasks.length > 0 && (
            <div className="relative ml-[18px] mt-0.5">
              {/* Vertical connecting line */}
              <div className="absolute left-0 top-0 bottom-0 w-px bg-border-subtle" />

              {activeTasks.map((task) => {
                const label = task.title || task.notes.split('\n')[0] || task.prompt.slice(0, 40) || 'Untitled'
                return (
                  <button
                    key={task.id}
                    onClick={() => setActiveView('board')}
                    className="group relative w-full flex items-center gap-2 pl-4 pr-2 py-1 text-left rounded-r-md hover:bg-surface-100 transition-colors"
                  >
                    {/* Horizontal branch tick */}
                    <div className="absolute left-0 top-1/2 w-2.5 h-px bg-border-subtle" />
                    <span className="text-[12px] text-text-secondary truncate">{label}</span>
                    {task.dangerousMode && (
                      <span className="flex-shrink-0 text-[9px] text-red-400 font-medium">skip</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
```

- [ ] **Step 2: Add useMemo import if not already present**

Check the import line at the top of `SidebarSections.tsx`. It currently imports:
```typescript
import { useCallback, useMemo, useState } from 'react'
```
`useMemo` is already imported — no change needed.

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: Full pass. All files should compile cleanly now.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/layout/SidebarSections.tsx
git commit -m "feat(board): update sidebar to filter terminal-column tasks and rename Queue to Board"
```

---

## Task 10: Create Board Drag-and-Drop Hook

**Files:**
- Create: `src/renderer/src/hooks/use-board-dnd.ts`

- [ ] **Step 1: Create the drag-and-drop hook**

Create `src/renderer/src/hooks/use-board-dnd.ts`:

```typescript
import { useCallback, useRef, useState } from 'react'
import { useBoardStore } from '../store/board-store'

interface DragState {
  taskId: string
  sourceColumnId: string
  startX: number
  startY: number
  started: boolean
}

interface DropTarget {
  columnId: string
  order: number
}

const DRAG_THRESHOLD = 5

export function useBoardDnd() {
  const moveTask = useBoardStore((s) => s.moveTask)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const ghostRef = useRef<HTMLElement | null>(null)

  const createGhost = useCallback((sourceEl: HTMLElement, x: number, y: number) => {
    const ghost = sourceEl.cloneNode(true) as HTMLElement
    ghost.style.position = 'fixed'
    ghost.style.zIndex = '9999'
    ghost.style.width = `${sourceEl.offsetWidth}px`
    ghost.style.pointerEvents = 'none'
    ghost.style.opacity = '0.85'
    ghost.style.transform = 'rotate(2deg) scale(1.02)'
    ghost.style.left = `${x - sourceEl.offsetWidth / 2}px`
    ghost.style.top = `${y - 20}px`
    document.body.appendChild(ghost)
    return ghost
  }, [])

  const removeGhost = useCallback(() => {
    if (ghostRef.current) {
      ghostRef.current.remove()
      ghostRef.current = null
    }
  }, [])

  const findDropTarget = useCallback((x: number, y: number): DropTarget | null => {
    // Find which column we're over
    const columnEls = document.querySelectorAll<HTMLElement>('[data-column-id]')
    for (const colEl of columnEls) {
      const rect = colEl.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right) {
        const columnId = colEl.dataset.columnId!
        // Find which card position we're nearest to
        const cardEls = colEl.querySelectorAll<HTMLElement>('[data-task-id]')
        let order = 0
        for (const cardEl of cardEls) {
          const cardRect = cardEl.getBoundingClientRect()
          const cardMidY = cardRect.top + cardRect.height / 2
          if (y > cardMidY) {
            order++
          }
        }
        return { columnId, order }
      }
    }
    return null
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent, taskId: string, columnId: string) => {
    // Only left mouse button
    if (e.button !== 0) return
    e.preventDefault()

    dragRef.current = {
      taskId,
      sourceColumnId: columnId,
      startX: e.clientX,
      startY: e.clientY,
      started: false
    }

    const sourceEl = (e.target as HTMLElement).closest('[data-task-id]') as HTMLElement | null

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const dx = ev.clientX - drag.startX
      const dy = ev.clientY - drag.startY

      if (!drag.started) {
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
        drag.started = true
        setDraggingTaskId(drag.taskId)
        if (sourceEl) {
          ghostRef.current = createGhost(sourceEl, ev.clientX, ev.clientY)
        }
      }

      if (ghostRef.current) {
        ghostRef.current.style.left = `${ev.clientX - (sourceEl?.offsetWidth ?? 200) / 2}px`
        ghostRef.current.style.top = `${ev.clientY - 20}px`
      }

      const target = findDropTarget(ev.clientX, ev.clientY)
      setDropTarget(target)
    }

    const onUp = () => {
      const drag = dragRef.current
      if (drag?.started && dropTarget) {
        // Perform the move — adjust order if dropping in same column below current position
        moveTask(drag.taskId, dropTarget.columnId, dropTarget.order)
      }

      dragRef.current = null
      setDraggingTaskId(null)
      setDropTarget(null)
      removeGhost()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [createGhost, removeGhost, findDropTarget, moveTask, dropTarget])

  return {
    draggingTaskId,
    dropTarget,
    onPointerDown
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: Compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/use-board-dnd.ts
git commit -m "feat(board): add hand-rolled drag-and-drop hook for cards between columns"
```

---

## Task 11: Integrate Drag-and-Drop into Board and Cards

**Files:**
- Modify: `src/renderer/src/components/board/KanbanBoard.tsx`
- Modify: `src/renderer/src/components/board/KanbanColumn.tsx`
- Modify: `src/renderer/src/components/board/KanbanCard.tsx`

- [ ] **Step 1: Add DnD hook to KanbanBoard and pass props down**

In `src/renderer/src/components/board/KanbanBoard.tsx`, add the import at the top (after existing imports):

```typescript
import { useBoardDnd } from '../../hooks/use-board-dnd'
```

Inside the `TaskQueue` function, after the `useBoardPersistence()` call, add:

```typescript
  const { draggingTaskId, dropTarget, onPointerDown } = useBoardDnd()
```

Update the `<KanbanColumn>` JSX to pass DnD props. Replace the column map inside the board `<div>` with:

```typescript
          {sortedColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn.get(column.id) ?? []}
              onAddTask={handleAddTask}
              onRunTask={runTask}
              onClickTask={handleClickTask}
              onContextMenuTask={handleContextMenuTask}
              onRenameColumn={(id, title) => updateColumn(id, { title })}
              onDeleteColumn={deleteColumn}
              onAddColumnAfter={(id) => addColumn('New Column', id)}
              isOnlyInbox={inboxColumnCount <= 1}
              draggingTaskId={draggingTaskId}
              dropTarget={dropTarget}
              onPointerDown={onPointerDown}
            />
          ))}
```

- [ ] **Step 2: Update KanbanColumn to accept and forward DnD props**

In `src/renderer/src/components/board/KanbanColumn.tsx`, update the props interface — add these fields:

```typescript
  draggingTaskId?: string | null
  dropTarget?: { columnId: string; order: number } | null
  onPointerDown?: (e: React.PointerEvent, taskId: string, columnId: string) => void
```

Pass them to `KanbanCard`. Update the card rendering inside the card list `<div>`:

```typescript
        {sortedTasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            column={column}
            onRun={onRunTask}
            onClick={onClickTask}
            onContextMenu={onContextMenuTask}
            isDragging={draggingTaskId === task.id}
            onPointerDown={onPointerDown ? (e) => onPointerDown(e, task.id, column.id) : undefined}
          />
        ))}
```

Also update the column's root `<div>` to highlight when it's a drop target:

Replace `dragOverState && 'ring-2 ring-accent/40'` with:

```typescript
        dropTarget?.columnId === column.id && draggingTaskId && 'ring-2 ring-accent/40'
```

- [ ] **Step 3: Update KanbanCard to support pointer down handler**

In `src/renderer/src/components/board/KanbanCard.tsx`, add `onPointerDown` to the props interface:

```typescript
  onPointerDown?: (e: React.PointerEvent) => void
```

On the card's root `<div>`, add the `onPointerDown` handler:

```typescript
      onPointerDown={onPointerDown}
```

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: Full pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/board/KanbanBoard.tsx src/renderer/src/components/board/KanbanColumn.tsx src/renderer/src/components/board/KanbanCard.tsx
git commit -m "feat(board): integrate drag-and-drop into board, columns, and cards"
```

---

## Task 12: Final Validation

- [ ] **Step 1: Run full validation**

Run: `npm run typecheck && npm run lint`

Expected: All pass with no errors.

- [ ] **Step 2: Manual testing**

Run: `npm run dev`

Test the following:
1. Board view shows 4 default columns (Backlog, Ready, Running, Done)
2. Click "Add task" in a column — form opens with notes field
3. Create a task with just title + notes + folder (no prompt) — task appears in correct column
4. Click a card — detail panel opens with all fields editable
5. Add a prompt to the task in detail panel — prompt indicator badge appears on card
6. Click "Run" on a task with prompt — session spawns, card moves to Running column
7. Click "Run" on a task without prompt — detail panel opens instead
8. Drag a card between columns — card moves to new column
9. Rename a column by clicking its title
10. Add a new column via "+" button at far right
11. Delete a column via "..." menu — tasks move to Backlog
12. Sidebar shows "Board" with count excluding Done tasks
13. Search bar filters across title, notes, prompt, and folder

- [ ] **Step 3: Test migration**

If you have an existing `board.json` from the current Clave:
1. Check `~/Library/Application Support/clave/board.json` before running
2. Run `npm run dev` — existing tasks should appear in Backlog column
3. Four default columns should be created automatically

- [ ] **Step 4: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix(board): address issues found during manual testing"
```
