import { useSessionStore } from '../store/session-store'
import type { ActiveView } from '../store/session-types'

const VIEW_TARGETS: Set<string> = new Set([
  'terminals',
  'board',
  'history',
  'settings',
  'usage',
  'agents'
])

const SIDE_PANEL_TABS: Record<string, 'files' | 'git' | 'help'> = {
  'side:files': 'files',
  'side:git': 'git',
  'side:help': 'help'
}

export function navigateTo(target: string): boolean {
  const store = useSessionStore.getState()

  if (VIEW_TARGETS.has(target)) {
    store.setActiveView(target as ActiveView)
    return true
  }

  const sideTab = SIDE_PANEL_TABS[target]
  if (sideTab) {
    if (!store.fileTreeOpen) {
      store.toggleFileTree()
    }
    store.setSidePanelTab(sideTab)
    return true
  }

  return false
}

export function handleClaveLink(href: string): boolean {
  if (!href.startsWith('clave://navigate/')) return false
  const target = href.replace('clave://navigate/', '')
  return navigateTo(target)
}
