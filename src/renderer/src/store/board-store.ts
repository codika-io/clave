import { create } from 'zustand'
import type { BoardTask, BoardData, BoardColumn, ColumnBehavior, TagDefinition } from '../../../preload/index.d'

interface BoardState {
  tasks: BoardTask[]
  columns: BoardColumn[]
  loaded: boolean
  tags: TagDefinition[]
  activeTagFilter: string | null

  loadBoard: () => Promise<void>
  addTask: (
    task: Omit<BoardTask, 'id' | 'createdAt' | 'updatedAt' | 'columnId' | 'order'> & {
      columnId?: string
    }
  ) => void
  updateTask: (
    id: string,
    updates: Partial<
      Pick<BoardTask, 'title' | 'prompt' | 'notes' | 'cwd' | 'dangerousMode' | 'sessionId' | 'tags'>
    >
  ) => void
  deleteTask: (id: string) => void
  moveTask: (taskId: string, toColumnId: string, toOrder: number) => void

  addColumn: (title: string, afterColumnId?: string) => void
  updateColumn: (id: string, updates: Partial<Pick<BoardColumn, 'title' | 'color'>>) => void
  deleteColumn: (id: string) => void
  reorderColumns: (columnIds: string[]) => void

  getColumnByBehavior: (behavior: ColumnBehavior) => BoardColumn | undefined
  getInboxColumn: () => BoardColumn

  addTag: (name: string, color?: string) => void
  removeTag: (name: string) => void
  updateTagColor: (name: string, color: string) => void
  setActiveTagFilter: (tagName: string | null) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(state: { tasks: BoardTask[]; columns: BoardColumn[]; tags: TagDefinition[] }): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: BoardData = { tasks: state.tasks, columns: state.columns, tags: state.tags }
    window.electronAPI?.boardSave?.(data)
  }, 300)
}

const TAG_COLORS = [
  'blue', 'green', 'amber', 'red', 'purple', 'pink', 'cyan', 'orange'
] as const

function nextTagColor(existingTags: TagDefinition[]): string {
  const usedColors = new Set(existingTags.map((t) => t.color))
  return TAG_COLORS.find((c) => !usedColors.has(c)) ?? TAG_COLORS[existingTags.length % TAG_COLORS.length]
}

export const useBoardStore = create<BoardState>((set, get) => ({
  tasks: [],
  columns: [],
  loaded: false,
  tags: [],
  activeTagFilter: null,

  loadBoard: async () => {
    if (!window.electronAPI?.boardLoad) return
    const data = await window.electronAPI.boardLoad()
    set({ tasks: data.tasks, columns: data.columns, tags: data.tags ?? [], loaded: true })
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
      tags: partial.tags ?? [],
      createdAt: now,
      updatedAt: now,
      columnId,
      order: tasksInColumn.length,
      sessionId: undefined
    }
    const newTasks = [...state.tasks, task]
    set({ tasks: newTasks })
    debouncedSave({ tasks: newTasks, columns: state.columns, tags: state.tags })
  },

  updateTask: (id, updates) => {
    const state = get()
    const newTasks = state.tasks.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave({ tasks: newTasks, columns: state.columns, tags: state.tags })
  },

  deleteTask: (id) => {
    const state = get()
    const newTasks = state.tasks.filter((t) => t.id !== id)
    set({ tasks: newTasks })
    debouncedSave({ tasks: newTasks, columns: state.columns, tags: state.tags })
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
        t.columnId === fromColumnId && t.order > task.order ? { ...t, order: t.order - 1 } : t
      )
    }

    // Make space at target position
    newTasks = newTasks.map((t) =>
      t.columnId === toColumnId && t.order >= toOrder ? { ...t, order: t.order + 1 } : t
    )

    // Insert at new position
    newTasks.push({
      ...task,
      columnId: toColumnId,
      order: toOrder,
      updatedAt: Date.now()
    })

    set({ tasks: newTasks })
    debouncedSave({ tasks: newTasks, columns: state.columns, tags: state.tags })
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
    debouncedSave({ tasks: state.tasks, columns: newColumns, tags: state.tags })
  },

  updateColumn: (id, updates) => {
    const state = get()
    const newColumns = state.columns.map((c) => (c.id === id ? { ...c, ...updates } : c))
    set({ columns: newColumns })
    debouncedSave({ tasks: state.tasks, columns: newColumns, tags: state.tags })
  },

  deleteColumn: (id) => {
    const state = get()
    const column = state.columns.find((c) => c.id === id)
    if (!column) return
    if (column.locked) return

    const inbox = state.getInboxColumn()

    const remainingColumns = state.columns.filter((c) => c.id !== id)
    if (remainingColumns.length === 0) return

    const targetColumnId =
      column.id === inbox.id ? remainingColumns.sort((a, b) => a.order - b.order)[0].id : inbox.id

    const targetTaskCount = state.tasks.filter((t) => t.columnId === targetColumnId).length
    const newTasks = state.tasks.map((t, idx) =>
      t.columnId === id
        ? { ...t, columnId: targetColumnId, order: targetTaskCount + idx, updatedAt: Date.now() }
        : t
    )

    const newColumns = remainingColumns
      .sort((a, b) => a.order - b.order)
      .map((c, i) => ({ ...c, order: i }))

    set({ tasks: newTasks, columns: newColumns })
    debouncedSave({ tasks: newTasks, columns: newColumns, tags: state.tags })
  },

  reorderColumns: (columnIds) => {
    const state = get()
    const newColumns = state.columns.map((c) => {
      const newOrder = columnIds.indexOf(c.id)
      return newOrder >= 0 ? { ...c, order: newOrder } : c
    })
    set({ columns: newColumns })
    debouncedSave({ tasks: state.tasks, columns: newColumns, tags: state.tags })
  },

  getColumnByBehavior: (behavior) => {
    return get().columns.find((c) => c.behavior === behavior)
  },

  getInboxColumn: () => {
    const state = get()
    return (
      state.columns.find((c) => c.behavior === 'default-inbox') ??
      state.columns.sort((a, b) => a.order - b.order)[0]
    )
  },

  addTag: (name, color) => {
    const state = get()
    const normalized = name.trim().toLowerCase().replace(/^#/, '')
    if (!normalized) return
    if (state.tags.some((t) => t.name === normalized)) return
    const newTags = [...state.tags, { name: normalized, color: color ?? nextTagColor(state.tags) }]
    set({ tags: newTags })
    debouncedSave({ tasks: state.tasks, columns: state.columns, tags: newTags })
  },

  removeTag: (name) => {
    const state = get()
    const newTags = state.tags.filter((t) => t.name !== name)
    const newTasks = state.tasks.map((t) =>
      t.tags.includes(name) ? { ...t, tags: t.tags.filter((tag) => tag !== name), updatedAt: Date.now() } : t
    )
    set({ tags: newTags, tasks: newTasks })
    if (state.activeTagFilter === name) set({ activeTagFilter: null })
    debouncedSave({ tasks: newTasks, columns: state.columns, tags: newTags })
  },

  updateTagColor: (name, color) => {
    const state = get()
    const newTags = state.tags.map((t) => (t.name === name ? { ...t, color } : t))
    set({ tags: newTags })
    debouncedSave({ tasks: state.tasks, columns: state.columns, tags: newTags })
  },

  setActiveTagFilter: (tagName) => {
    set({ activeTagFilter: tagName })
  }
}))
