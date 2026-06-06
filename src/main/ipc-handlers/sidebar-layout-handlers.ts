import { ipcMain } from 'electron'
import { sidebarLayoutManager, type SidebarLayout } from '../sidebar-layout-manager'

export function registerSidebarLayoutHandlers(): void {
  ipcMain.handle('sidebar-layout:load', () => sidebarLayoutManager.load())
  ipcMain.handle('sidebar-layout:save', (_event, data: SidebarLayout) =>
    sidebarLayoutManager.save(data)
  )
}
