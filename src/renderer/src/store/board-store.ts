import { create } from 'zustand'
import type { BoardTask, BoardData } from '../../../preload/index.d'

interface BoardState {
  tasks: BoardTask[]
  loaded: boolean

  loadBoard: () => Promise<void>
  addTask: (task: Omit<BoardTask, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateTask: (id: string, updates: Partial<Pick<BoardTask, 'title' | 'prompt' | 'cwd' | 'dangerousMode'>>) => void
  deleteTask: (id: string) => void
  removeTask: (id: string) => void
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

  loadBoard: async () => {
    if (!window.electronAPI?.boardLoad) return
    const data = await window.electronAPI.boardLoad()
    set({ tasks: data.tasks, loaded: true })
  },

  addTask: (partial) => {
    const now = Date.now()
    const task: BoardTask = {
      id: crypto.randomUUID(),
      title: partial.title,
      prompt: partial.prompt,
      cwd: partial.cwd,
      dangerousMode: partial.dangerousMode,
      createdAt: now,
      updatedAt: now
    }
    const newTasks = [...get().tasks, task]
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

  removeTask: (id) => {
    const newTasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks: newTasks })
    debouncedSave(newTasks)
  }
}))
