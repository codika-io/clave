import { ipcMain } from 'electron'
import { templateManager, type LaunchTemplate, type LaunchTemplatesData } from '../template-manager'

export function registerTemplateHandlers(): void {
  ipcMain.handle('templates:load', () => templateManager.load())
  ipcMain.handle('templates:save', (_event, data: LaunchTemplatesData) => templateManager.save(data))
  ipcMain.handle('templates:validate', (_event, template: LaunchTemplate) =>
    templateManager.validateTemplate(template)
  )
}
