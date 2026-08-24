import { ipcMain, BrowserWindow } from 'electron'
import { sidebarLayoutManager, type SidebarLayout } from '../sidebar-layout-manager'
import { windowRegistry } from '../window-registry'
import { windowState } from '../window-state'

/** One layout file per window: a renderer loads and saves ITS OWN, resolved
 *  from the sender — a renderer never names a window key. The primary's
 *  load also takes in the orphans (files whose window no longer exists). */
export function registerSidebarLayoutHandlers(): void {
  ipcMain.handle('sidebar-layout:load', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const key = win ? windowRegistry.getKeyForWindow(win.id) : null
    if (!win || !key) return { groups: [], displayOrder: [] } satisfies SidebarLayout
    const own = sidebarLayoutManager.loadForWindow(key)
    if (!windowRegistry.isPrimary(win.id)) return own
    // Known = every window that exists (live or persisted for the next boot).
    const known = new Set([...windowState.keys(), ...windowRegistry.liveKeys()])
    const orphans = sidebarLayoutManager.takeOrphans(known)
    if (orphans.groups.length === 0 && orphans.displayOrder.length === 0) return own
    return {
      groups: [...own.groups, ...orphans.groups],
      displayOrder: [...own.displayOrder, ...orphans.displayOrder]
    } satisfies SidebarLayout
  })

  ipcMain.handle('sidebar-layout:save', (event, data: SidebarLayout) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const key = win ? windowRegistry.getKeyForWindow(win.id) : null
    if (!key) {
      console.error('[sidebar-layout] refused: save from an unknown window')
      return { ok: false as const, reason: 'no-window' as const }
    }
    sidebarLayoutManager.saveForWindow(key, data)
    return { ok: true as const }
  })
}
