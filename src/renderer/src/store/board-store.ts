import { create } from 'zustand'
import type { BoardTask, BoardTemplate, BoardData } from '../../../preload/index.d'

interface BoardState {
  tasks: BoardTask[]
  templates: BoardTemplate[]
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
  addTemplate: (t: { name: string; title: string; prompt: string; cwd: string | null }) => void
  deleteTemplate: (id: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(tasks: BoardTask[], templates: BoardTemplate[]): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: BoardData = { tasks, templates }
    window.electronAPI?.boardSave?.(data)
  }, 300)
}

export const useBoardStore = create<BoardState>((set, get) => ({
  tasks: [],
  templates: [],
  loaded: false,
  cwdFilter: null,

  loadBoard: async () => {
    if (!window.electronAPI?.boardLoad) return
    const data = await window.electronAPI.boardLoad()
    set({ tasks: data.tasks, templates: data.templates ?? [], loaded: true })
  },

  addTask: (partial) => {
    const now = Date.now()
    const { tasks, templates } = get()
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
    debouncedSave(newTasks, templates)
  },

  updateTask: (id, updates) => {
    const { templates } = get()
    const newTasks = get().tasks.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks, templates)
  },

  deleteTask: (id) => {
    const { templates } = get()
    const newTasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks: newTasks })
    debouncedSave(newTasks, templates)
  },

  moveTask: (id, status) => {
    const { tasks, templates } = get()
    const maxOrder = tasks.filter((t) => t.status === status).reduce((max, t) => Math.max(max, t.order), -1)
    const newTasks = tasks.map((t) =>
      t.id === id ? { ...t, status, order: maxOrder + 1, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks, templates)
  },

  linkSession: (taskId, sessionId) => {
    const { templates } = get()
    const newTasks = get().tasks.map((t) =>
      t.id === taskId ? { ...t, sessionId, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks, templates)
  },

  completeTask: (taskId) => {
    const { tasks, templates } = get()
    const maxOrder = tasks.filter((t) => t.status === 'done').reduce((max, t) => Math.max(max, t.order), -1)
    const newTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, status: 'done' as const, order: maxOrder + 1, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks, templates)
  },

  reorderTask: (id, newOrder) => {
    const { templates } = get()
    const newTasks = get().tasks.map((t) =>
      t.id === id ? { ...t, order: newOrder, updatedAt: Date.now() } : t
    )
    set({ tasks: newTasks })
    debouncedSave(newTasks, templates)
  },

  setCwdFilter: (cwd) => set({ cwdFilter: cwd }),

  addTemplate: (t) => {
    const { tasks, templates } = get()
    const template: BoardTemplate = {
      id: crypto.randomUUID(),
      name: t.name,
      title: t.title,
      prompt: t.prompt,
      cwd: t.cwd,
      createdAt: Date.now()
    }
    const newTemplates = [...templates, template]
    set({ templates: newTemplates })
    debouncedSave(tasks, newTemplates)
  },

  deleteTemplate: (id) => {
    const { tasks, templates } = get()
    const newTemplates = templates.filter((t) => t.id !== id)
    set({ templates: newTemplates })
    debouncedSave(tasks, newTemplates)
  }
}))
