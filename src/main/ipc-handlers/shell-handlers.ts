import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import net from 'node:net'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    // Only http(s)/mailto may be opened. Terminal output (incl. spoofed OSC-8
    // hyperlinks whose display text differs from the URI) and agent-rendered
    // markdown both reach this sink, so an unrestricted handler would let a
    // single click launch arbitrary URI-scheme handlers (file:, smb:, vscode:,
    // raycast:, …) with attacker-chosen payloads.
    try {
      const { protocol } = new URL(url)
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
        return shell.openExternal(url)
      }
    } catch {
      // invalid URL — fall through to the block path
    }
    console.warn('[shell] blocked openExternal for disallowed URL:', url)
    return Promise.resolve()
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

  ipcMain.handle('dialog:openFolder', async (_event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      ...(defaultPath ? { defaultPath } : {})
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
