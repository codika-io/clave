import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ptyManager } from './pty-manager'
import { installUpdate } from './auto-updater'

export function registerIpcHandlers(): void {
  ipcMain.handle('updater:install', () => {
    installUpdate()
  })

  ipcMain.handle('pty:spawn', (_event, cwd: string, options?: { dangerousMode?: boolean }) => {
    const session = ptyManager.spawn(cwd, options)
    const win = BrowserWindow.fromWebContents(_event.sender)

    session.ptyProcess.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:data:${session.id}`, data)
      }
    })

    session.ptyProcess.onExit(({ exitCode }) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:exit:${session.id}`, exitCode)
      }
    })

    return {
      id: session.id,
      cwd: session.cwd,
      folderName: session.folderName,
      alive: session.alive
    }
  })

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    ptyManager.write(id, data)
  })

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    ptyManager.resize(id, cols, rows)
  })

  ipcMain.handle('pty:kill', (_event, id: string) => {
    ptyManager.kill(id)
  })

  ipcMain.handle('pty:list', () => {
    return ptyManager.getAllSessions()
  })

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
