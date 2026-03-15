import { ipcMain, dialog, shell, BrowserWindow } from 'electron'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('shell:openPath', (_event, filePath: string) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle('dialog:openFolder', async (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
