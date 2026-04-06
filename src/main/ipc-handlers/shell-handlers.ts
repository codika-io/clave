import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import net from 'node:net'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('net:check-port', (_event, port: number) => {
    const tryConnect = (host: string): Promise<boolean> =>
      new Promise((resolve) => {
        const socket = net.createConnection({ port, host, timeout: 2000 })
        socket.once('connect', () => {
          socket.destroy()
          resolve(true)
        })
        socket.once('error', () => {
          socket.destroy()
          resolve(false)
        })
        socket.once('timeout', () => {
          socket.destroy()
          resolve(false)
        })
      })

    // Try IPv4 first, then IPv6 — covers servers bound to 127.0.0.1, ::1, or 0.0.0.0
    return tryConnect('127.0.0.1').then((ok) => (ok ? true : tryConnect('::1')))
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

  ipcMain.handle('dialog:openFiles', async (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
        { name: 'Text Files', extensions: ['csv', 'json', 'txt', 'md', 'ts', 'js', 'py', 'yaml', 'yml'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths
  })
}
