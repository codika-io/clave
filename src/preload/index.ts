import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  spawnSession: (cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean }) =>
    ipcRenderer.invoke('pty:spawn', cwd, options),

  writeSession: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),

  resizeSession: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('pty:resize', id, cols, rows),

  killSession: (id: string) => ipcRenderer.invoke('pty:kill', id),

  listSessions: () => ipcRenderer.invoke('pty:list'),

  onSessionData: (id: string, callback: (data: string) => void) => {
    const channel = `pty:data:${id}`
    const listener = (_event: Electron.IpcRendererEvent, data: string): void => callback(data)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  onSessionExit: (id: string, callback: (exitCode: number) => void) => {
    const channel = `pty:exit:${id}`
    const listener = (_event: Electron.IpcRendererEvent, exitCode: number): void =>
      callback(exitCode)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  onUpdateDownloaded: (callback: (version: string) => void) => {
    const channel = 'updater:update-downloaded'
    const listener = (_event: Electron.IpcRendererEvent, version: string): void =>
      callback(version)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  installUpdate: () => ipcRenderer.invoke('updater:install')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
