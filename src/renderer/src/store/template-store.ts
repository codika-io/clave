import { create } from 'zustand'
import type {
  LaunchTemplate,
  LaunchTemplateSession,
  LaunchTemplateGroup,
  LaunchTemplatesData
} from '../../../preload/index.d'
import { useSessionStore } from './session-store'

interface TemplateState {
  templates: LaunchTemplate[]
  defaultTemplateId: string
  loaded: boolean

  loadTemplates: () => Promise<void>
  addTemplate: (template: LaunchTemplate) => void
  updateTemplate: (id: string, updates: Partial<Pick<LaunchTemplate, 'name'>>) => void
  deleteTemplate: (id: string) => void
  setDefaultTemplate: (id: string) => void
  captureCurrentLayout: (name: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(templates: LaunchTemplate[], defaultTemplateId: string): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: LaunchTemplatesData = { templates, defaultTemplateId }
    window.electronAPI?.templatesSave?.(data)
  }, 300)
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  defaultTemplateId: 'blank',
  loaded: false,

  loadTemplates: async () => {
    if (!window.electronAPI?.templatesLoad) return
    const data = await window.electronAPI.templatesLoad()
    set({
      templates: data.templates ?? [],
      defaultTemplateId: data.defaultTemplateId ?? 'blank',
      loaded: true
    })
  },

  addTemplate: (template) => {
    const { templates, defaultTemplateId } = get()
    const newTemplates = [...templates, template]
    set({ templates: newTemplates })
    debouncedSave(newTemplates, defaultTemplateId)
  },

  updateTemplate: (id, updates) => {
    const { templates, defaultTemplateId } = get()
    const now = Date.now()
    const newTemplates = templates.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: now } : t
    )
    set({ templates: newTemplates })
    debouncedSave(newTemplates, defaultTemplateId)
  },

  deleteTemplate: (id) => {
    const { templates, defaultTemplateId } = get()
    const newTemplates = templates.filter((t) => t.id !== id)
    const newDefault = defaultTemplateId === id ? 'blank' : defaultTemplateId
    set({ templates: newTemplates, defaultTemplateId: newDefault })
    debouncedSave(newTemplates, newDefault)
  },

  setDefaultTemplate: (id) => {
    const { templates } = get()
    set({ defaultTemplateId: id })
    debouncedSave(templates, id)
  },

  captureCurrentLayout: (name) => {
    const sessionState = useSessionStore.getState()
    const { sessions, groups, displayOrder } = sessionState

    if (sessions.length === 0) return

    // Map old IDs to new UUIDs
    const sessionIdMap = new Map<string, string>()
    const groupIdMap = new Map<string, string>()

    const templateSessions: LaunchTemplateSession[] = sessions.map((s) => {
      const newId = crypto.randomUUID()
      sessionIdMap.set(s.id, newId)
      return { id: newId, cwd: s.cwd, name: s.name, claudeMode: s.claudeMode, dangerousMode: s.dangerousMode }
    })

    const templateGroups: LaunchTemplateGroup[] = groups.map((g) => {
      const newId = crypto.randomUUID()
      groupIdMap.set(g.id, newId)
      return {
        id: newId,
        name: g.name,
        sessionIds: g.sessionIds
          .map((sid) => sessionIdMap.get(sid))
          .filter((id): id is string => id !== undefined),
        collapsed: g.collapsed,
        cwd: g.cwd ?? null,
        terminals: g.terminals.map((t) => ({
          id: crypto.randomUUID(),
          command: t.command,
          commandMode: t.commandMode,
          color: t.color
        }))
      }
    })

    const templateDisplayOrder = displayOrder
      .map((id) => groupIdMap.get(id) ?? sessionIdMap.get(id))
      .filter((id): id is string => id !== undefined)

    const now = Date.now()
    const template: LaunchTemplate = {
      id: crypto.randomUUID(),
      name,
      sessions: templateSessions,
      groups: templateGroups,
      displayOrder: templateDisplayOrder,
      createdAt: now,
      updatedAt: now
    }

    const { templates, defaultTemplateId } = get()
    const newTemplates = [...templates, template]
    set({ templates: newTemplates })
    debouncedSave(newTemplates, defaultTemplateId)
  }
}))
