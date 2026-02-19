import { contextBridge, ipcRenderer, webUtils } from 'electron'

const electronAPI = {
  spawnSession: (cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean; resumeSessionId?: string }) =>
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

  installUpdate: () => ipcRenderer.invoke('updater:install'),

  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // File system
  listFiles: (cwd: string) => ipcRenderer.invoke('fs:list-files', cwd),
  readDir: (rootCwd: string, dirPath: string) =>
    ipcRenderer.invoke('fs:read-dir', rootCwd, dirPath),
  readFile: (rootCwd: string, filePath: string) =>
    ipcRenderer.invoke('fs:read-file', rootCwd, filePath),
  statFile: (rootCwd: string, filePath: string) =>
    ipcRenderer.invoke('fs:stat', rootCwd, filePath),
  showItemInFolder: (fullPath: string) =>
    ipcRenderer.invoke('shell:showItemInFolder', fullPath),

  // Board
  boardLoad: () => ipcRenderer.invoke('board:load'),
  boardSave: (data: unknown) => ipcRenderer.invoke('board:save', data),

  // Usage
  getUsageStats: () => ipcRenderer.invoke('usage:get-stats'),
  fetchRateLimits: () => ipcRenderer.invoke('usage:fetch-rate-limits'),

  // Git
  getGitStatus: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
  gitStage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:stage', cwd, files),
  gitUnstage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:unstage', cwd, files),
  gitCommit: (cwd: string, message: string) => ipcRenderer.invoke('git:commit', cwd, message),
  gitPush: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
  gitPull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
  gitDiff: (cwd: string, filePath: string, staged: boolean, isUntracked: boolean) =>
    ipcRenderer.invoke('git:diff', cwd, filePath, staged, isUntracked),

  onClaudeSessionDetected: (sessionId: string, callback: (claudeSessionId: string) => void) => {
    const channel = `pty:claude-session-id:${sessionId}`
    const listener = (_event: Electron.IpcRendererEvent, claudeSessionId: string): void =>
      callback(claudeSessionId)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  showNotification: (options: { title: string; body: string; sessionId: string }) =>
    ipcRenderer.invoke('notification:show', options),

  onNotificationClicked: (callback: (sessionId: string) => void) => {
    const channel = 'notification:clicked'
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string): void =>
      callback(sessionId)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
