// src/renderer/src/store/assistant-store.ts
import { create } from 'zustand'

interface JournalEntry {
  sessionId: string
  claudeSessionId?: string
  sessionName: string
  summary?: string
  startTime: number
  endTime?: number
  status: 'active' | 'completed'
}

interface JournalProject {
  cwd: string
  name: string
  entries: JournalEntry[]
}

interface JournalDay {
  date: string
  projects: JournalProject[]
}

interface AssistantState {
  journal: JournalDay
  loaded: boolean
  enabled: boolean
  aiSummaries: boolean

  // Actions
  loadJournal: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setAiSummaries: (enabled: boolean) => void
  addEntry: (entry: JournalEntry, cwd: string) => void
  completeEntry: (sessionId: string, summary?: string) => void
  updateEntryName: (sessionId: string, name: string) => void
  removeActiveEntry: (sessionId: string) => void
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function getProjectName(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() || cwd
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(journal: JournalDay): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.electronAPI?.journalSave?.(journal)
  }, 300)
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  journal: { date: '', projects: [] },
  loaded: false,
  enabled: localStorage.getItem('clave-ai-assistant-enabled') !== 'false',
  aiSummaries: localStorage.getItem('clave-ai-summaries-enabled') !== 'false',

  setEnabled: (enabled) => {
    localStorage.setItem('clave-ai-assistant-enabled', String(enabled))
    set({ enabled })
  },

  setAiSummaries: (enabled) => {
    localStorage.setItem('clave-ai-summaries-enabled', String(enabled))
    set({ aiSummaries: enabled })
  },

  loadJournal: async () => {
    if (!window.electronAPI?.journalLoad) return
    const data = await window.electronAPI.journalLoad()
    const today = getTodayString()

    if (data.date === today) {
      set({ journal: data, loaded: true })
    } else {
      // Stale data — start fresh for today
      const fresh: JournalDay = { date: today, projects: [] }
      set({ journal: fresh, loaded: true })
      debouncedSave(fresh)
    }
  },

  addEntry: (entry, cwd) => {
    const state = get()
    const today = getTodayString()
    const journal = state.journal.date === today ? state.journal : { date: today, projects: [] }

    const projects = [...journal.projects]
    const projectIdx = projects.findIndex((p) => p.cwd === cwd)

    if (projectIdx >= 0) {
      // Check for duplicate by sessionId
      if (projects[projectIdx].entries.some((e) => e.sessionId === entry.sessionId)) return
      // If same claudeSessionId exists (resumed session), update it instead of adding new entry
      if (entry.claudeSessionId) {
        const existingIdx = projects[projectIdx].entries.findIndex(
          (e) => e.claudeSessionId === entry.claudeSessionId
        )
        if (existingIdx >= 0) {
          projects[projectIdx] = {
            ...projects[projectIdx],
            entries: projects[projectIdx].entries.map((e, i) =>
              i === existingIdx
                ? {
                    ...e,
                    sessionId: entry.sessionId,
                    status: 'active' as const,
                    endTime: undefined
                  }
                : e
            )
          }
          const updated = { date: today, projects }
          set({ journal: updated })
          debouncedSave(updated)
          return
        }
      }
      projects[projectIdx] = {
        ...projects[projectIdx],
        entries: [entry, ...projects[projectIdx].entries]
      }
    } else {
      projects.unshift({
        cwd,
        name: getProjectName(cwd),
        entries: [entry]
      })
    }

    const updated = { date: today, projects }
    set({ journal: updated })
    debouncedSave(updated)
  },

  completeEntry: (sessionId, summary) => {
    const state = get()
    const projects = state.journal.projects.map((p) => ({
      ...p,
      entries: p.entries.map((e) =>
        e.sessionId === sessionId
          ? {
              ...e,
              status: 'completed' as const,
              endTime: Date.now(),
              summary: summary ?? e.summary
            }
          : e
      )
    }))
    const updated = { ...state.journal, projects }
    set({ journal: updated })
    debouncedSave(updated)
  },

  updateEntryName: (sessionId, name) => {
    const state = get()
    const projects = state.journal.projects.map((p) => ({
      ...p,
      entries: p.entries.map((e) =>
        e.sessionId === sessionId ? { ...e, sessionName: name } : e
      )
    }))
    const updated = { ...state.journal, projects }
    set({ journal: updated })
    debouncedSave(updated)
  },

  removeActiveEntry: (sessionId) => {
    const state = get()
    const projects = state.journal.projects
      .map((p) => ({
        ...p,
        entries: p.entries.filter((e) => !(e.sessionId === sessionId && e.status === 'active'))
      }))
      .filter((p) => p.entries.length > 0)
    const updated = { ...state.journal, projects }
    set({ journal: updated })
    debouncedSave(updated)
  }
}))
