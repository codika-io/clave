import { useEffect, useRef } from 'react'
import { useTemplateStore } from '../store/template-store'
import { useSessionStore } from '../store/session-store'

export function useLaunchTemplate(): void {
  const hasApplied = useRef(false)
  const loaded = useTemplateStore((s) => s.loaded)
  const templates = useTemplateStore((s) => s.templates)
  const defaultTemplateId = useTemplateStore((s) => s.defaultTemplateId)

  // Load template data on mount
  useEffect(() => {
    useTemplateStore.getState().loadTemplates()
  }, [])

  // Apply default template once after load
  useEffect(() => {
    if (!loaded || hasApplied.current) return
    hasApplied.current = true

    if (defaultTemplateId === 'blank') return

    const template = templates.find((t) => t.id === defaultTemplateId)
    if (!template || template.sessions.length === 0) return

    applyTemplate(template)
  }, [loaded, defaultTemplateId, templates])
}

async function applyTemplate(template: ReturnType<typeof useTemplateStore.getState>['templates'][0]): Promise<void> {
  if (!window.electronAPI?.templatesValidate || !window.electronAPI?.spawnSession) return

  const { valid } = await window.electronAPI.templatesValidate(template)
  const validIds = new Set(valid.map((s) => s.id))

  if (valid.length === 0) {
    console.warn('[launch-template] All session directories are missing, skipping template apply')
    return
  }

  const state = useSessionStore.getState()
  const { dangerousMode, claudeMode } = state

  // Map template session IDs to spawned session IDs
  const idMap = new Map<string, string>()

  // Spawn sessions sequentially to avoid race conditions
  for (const templateSession of template.sessions) {
    if (!validIds.has(templateSession.id)) {
      console.warn(`[launch-template] Skipping session "${templateSession.name}" — directory missing: ${templateSession.cwd}`)
      continue
    }

    try {
      const sessionInfo = await window.electronAPI.spawnSession(templateSession.cwd, {
        dangerousMode,
        claudeMode
      })

      idMap.set(templateSession.id, sessionInfo.id)

      useSessionStore.getState().addSession({
        id: sessionInfo.id,
        cwd: sessionInfo.cwd,
        folderName: sessionInfo.folderName,
        name: templateSession.name,
        alive: sessionInfo.alive,
        activityStatus: 'idle',
        promptWaiting: null
      })

      // Apply custom name if different from folderName
      if (templateSession.name !== sessionInfo.folderName) {
        useSessionStore.getState().renameSession(sessionInfo.id, templateSession.name)
      }
    } catch (err) {
      console.error(`[launch-template] Failed to spawn session "${templateSession.name}":`, err)
    }
  }

  // Create groups
  for (const templateGroup of template.groups) {
    const mappedIds = templateGroup.sessionIds
      .map((id) => idMap.get(id))
      .filter((id): id is string => id !== undefined)

    if (mappedIds.length > 0) {
      useSessionStore.getState().createGroup(mappedIds, templateGroup.name)
    }
  }
}
