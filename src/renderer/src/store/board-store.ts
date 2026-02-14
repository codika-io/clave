import { create } from 'zustand'
import type { BoardTask, BoardData } from '../../../preload/index.d'

interface BoardState {
  tasks: BoardTask[]
  loaded: boolean
  cwdFilter: string | null

  loadBoard: () => Promise<void>
  addTask: (task: Omit<BoardTask, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'status' | 'sessionId'>) => void
  updateTask: (id: string, updates: Partial<Pick<BoardTask, 'title' | 'prompt' | 'cwd'>>) => void
  deleteTask: (id: string) => void
  moveTask: (id: string, status: BoardTask['status']) => void
  linkSession: (taskId: string, sessionId: string) => void
  completeTask: (taskId: string) => void
  reorderTask: (id: string, newOrder: number) => void
  setCwdFilter: (cwd: string | null) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(tasks: BoardTask[]): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: BoardData = { tasks }
    window.electronAPI?.boardSave?.(data)
  }, 300)
}

export const useBoardStore = create<BoardState>((set, get) => ({
  tasks: [],
  loaded: false,
  cwdFilter: null,

  loadBoard: async () => {
    if (!window.electronAPI?.boardLoad) return
    const data = await window.electronAPI.boardLoad()
    set({ tasks: data.tasks, loaded: true })
  },

  addTask: (partial) => {
    const now = Date.now()
    const tasks = get().tasks
    const maxOrder = tasks.filter((t) => t.status === 'todo').reduce((max, t) => Math.max(max, t.order), -1)
    const task: BoardTask = {
      id: crypto.randomUUID(),
      title: partial.title,
      prompt: partial.prompt,
      cwd: partial.cwd,
      status: 'todo',
      sessionId: null,
      createdAt: now,
      updatedAt: now,
      order: maxOrder + 1
    }
    const newTasks = [...tasks, task]
    set({ tasks: newTasks })
    debouncedSave(newTasks)
  },

  updateTask: (id, updates) => {
    const newTasks = get().tasks.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks)
  },

  deleteTask: (id) => {
    const newTasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks: newTasks })
    debouncedSave(newTasks)
  },

  moveTask: (id, status) => {
    const tasks = get().tasks
    const maxOrder = tasks.filter((t) => t.status === status).reduce((max, t) => Math.max(max, t.order), -1)
    const newTasks = tasks.map((t) =>
      t.id === id ? { ...t, status, order: maxOrder + 1, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks)
  },

  linkSession: (taskId, sessionId) => {
    const newTasks = get().tasks.map((t) =>
      t.id === taskId ? { ...t, sessionId, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks)
  },

  completeTask: (taskId) => {
    const tasks = get().tasks
    const maxOrder = tasks.filter((t) => t.status === 'done').reduce((max, t) => Math.max(max, t.order), -1)
    const newTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, status: 'done' as const, order: maxOrder + 1, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks)
  },

  reorderTask: (id, newOrder) => {
    const newTasks = get().tasks.map((t) =>
      t.id === id ? { ...t, order: newOrder, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks)
  },

  setCwdFilter: (cwd) => set({ cwdFilter: cwd })
}))
