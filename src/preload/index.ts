import { contextBridge, ipcRenderer, webUtils } from 'electron'

const electronAPI = {
  spawnSession: (cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean; resumeSessionId?: string; initialCommand?: string; autoExecute?: boolean }) =>
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

  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),

  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  onUpdateAvailable: (callback: (version: string) => void) => {
    const channel = 'updater:update-available'
    const listener = (_event: Electron.IpcRendererEvent, version: string): void =>
      callback(version)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  onUpdateDownloaded: (callback: (version: string) => void) => {
    const channel = 'updater:update-downloaded'
    const listener = (_event: Electron.IpcRendererEvent, version: string): void =>
      callback(version)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  onDownloadProgress: (
    callback: (progress: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }) => void
  ) => {
    const channel = 'updater:download-progress'
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }
    ): void => callback(progress)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  onDownloadError: (callback: (message: string) => void) => {
    const channel = 'updater:download-error'
    const listener = (_event: Electron.IpcRendererEvent, message: string): void =>
      callback(message)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  installUpdate: () => ipcRenderer.invoke('updater:install'),
  startDownload: () => ipcRenderer.invoke('updater:start-download'),
  cancelDownload: () => ipcRenderer.invoke('updater:cancel-download'),

  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // File system
  listFiles: (cwd: string) => ipcRenderer.invoke('fs:list-files', cwd),
  readDir: (rootCwd: string, dirPath: string) =>
    ipcRenderer.invoke('fs:read-dir', rootCwd, dirPath),
  readFile: (rootCwd: string, filePath: string) =>
    ipcRenderer.invoke('fs:read-file', rootCwd, filePath),
  statFile: (rootCwd: string, filePath: string) =>
    ipcRenderer.invoke('fs:stat', rootCwd, filePath),
  writeFile: (rootCwd: string, filePath: string, content: string) =>
    ipcRenderer.invoke('fs:write-file', rootCwd, filePath, content),
  createFile: (rootCwd: string, filePath: string) =>
    ipcRenderer.invoke('fs:create-file', rootCwd, filePath),
  createDirectory: (rootCwd: string, dirPath: string) =>
    ipcRenderer.invoke('fs:create-directory', rootCwd, dirPath),
  showItemInFolder: (fullPath: string) =>
    ipcRenderer.invoke('shell:showItemInFolder', fullPath),

  // File system watching
  watchDir: (cwd: string) => ipcRenderer.invoke('fs:watch', cwd),
  unwatchDir: () => ipcRenderer.invoke('fs:unwatch'),
  onFsChanged: (callback: (cwd: string, changedDirs: string[]) => void) => {
    const channel = 'fs:changed'
    const listener = (
      _event: Electron.IpcRendererEvent,
      cwd: string,
      changedDirs: string[]
    ): void => callback(cwd, changedDirs)
    ipcRenderer.on(channel, listener)
    return (): void => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  // Board
  boardLoad: () => ipcRenderer.invoke('board:load'),
  boardSave: (data: unknown) => ipcRenderer.invoke('board:save', data),

  // Templates
  templatesLoad: () => ipcRenderer.invoke('templates:load'),
  templatesSave: (data: unknown) => ipcRenderer.invoke('templates:save', data),
  templatesValidate: (template: unknown) => ipcRenderer.invoke('templates:validate', template),

  // Usage
  getUsageStats: () => ipcRenderer.invoke('usage:get-stats'),

  // Git
  gitCheckIgnored: (cwd: string, paths: string[]) =>
    ipcRenderer.invoke('git:check-ignored', cwd, paths),
  getGitStatus: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
  gitFetch: (cwd: string) => ipcRenderer.invoke('git:fetch', cwd),
  discoverGitRepos: (cwd: string) => ipcRenderer.invoke('git:discover-repos', cwd),
  gitStage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:stage', cwd, files),
  gitUnstage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:unstage', cwd, files),
  gitCommit: (cwd: string, message: string) => ipcRenderer.invoke('git:commit', cwd, message),
  gitPush: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
  gitPull: (cwd: string, strategy?: 'auto' | 'merge' | 'rebase' | 'ff-only') => ipcRenderer.invoke('git:pull', cwd, strategy),
  gitDiscard: (cwd: string, files: Array<{ path: string; status: string; staged: boolean }>) =>
    ipcRenderer.invoke('git:discard', cwd, files),
  gitDiff: (cwd: string, filePath: string, staged: boolean, isUntracked: boolean) =>
    ipcRenderer.invoke('git:diff', cwd, filePath, staged, isUntracked),
  gitLog: (cwd: string, maxCount?: number) =>
    ipcRenderer.invoke('git:log', cwd, maxCount),
  gitOutgoingCommits: (cwd: string) =>
    ipcRenderer.invoke('git:outgoing-commits', cwd),
  gitIncomingCommits: (cwd: string) =>
    ipcRenderer.invoke('git:incoming-commits', cwd),
  gitCommitFiles: (cwd: string, hash: string) =>
    ipcRenderer.invoke('git:commit-files', cwd, hash),
  gitCommitDiff: (cwd: string, hash: string, filePath: string) =>
    ipcRenderer.invoke('git:commit-diff', cwd, hash, filePath),
  gitGenerateCommitMessage: (cwd: string) =>
    ipcRenderer.invoke('git:generate-commit-message', cwd),

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
  },

  // ── Locations ──
  locationList: () => ipcRenderer.invoke('location:list'),
  locationAdd: (loc: unknown, password?: string) =>
    ipcRenderer.invoke('location:add', loc, password),
  locationUpdate: (id: string, updates: unknown) =>
    ipcRenderer.invoke('location:update', id, updates),
  locationRemove: (id: string) => ipcRenderer.invoke('location:remove', id),
  locationTestConnection: (id: string) =>
    ipcRenderer.invoke('location:test-connection', id),
  locationInstallPlugin: (id: string) =>
    ipcRenderer.invoke('location:install-plugin', id),

  // ── SSH / Remote Terminal ──
  sshConnect: (locationId: string) => ipcRenderer.invoke('ssh:connect', locationId),
  sshDisconnect: (locationId: string) => ipcRenderer.invoke('ssh:disconnect', locationId),
  sshOpenShell: (locationId: string, cwd?: string) =>
    ipcRenderer.invoke('ssh:open-shell', locationId, cwd),
  sshShellWrite: (shellId: string, data: string) =>
    ipcRenderer.send('ssh:shell-write', shellId, data),
  sshShellResize: (shellId: string, cols: number, rows: number) =>
    ipcRenderer.send('ssh:shell-resize', shellId, cols, rows),
  sshShellClose: (shellId: string) => ipcRenderer.invoke('ssh:shell-close', shellId),
  onSshShellData: (shellId: string, callback: (data: string) => void) => {
    const channel = `ssh:shell-data:${shellId}`
    const listener = (_event: Electron.IpcRendererEvent, data: string): void => callback(data)
    ipcRenderer.on(channel, listener)
    return (): void => { ipcRenderer.removeListener(channel, listener) }
  },
  onSshShellExit: (shellId: string, callback: (exitCode: number) => void) => {
    const channel = `ssh:shell-exit:${shellId}`
    const listener = (_event: Electron.IpcRendererEvent, exitCode: number): void => callback(exitCode)
    ipcRenderer.on(channel, listener)
    return (): void => { ipcRenderer.removeListener(channel, listener) }
  },

  // ── Remote FS (SFTP) ──
  sftpReadDir: (locationId: string, dirPath: string) =>
    ipcRenderer.invoke('sftp:read-dir', locationId, dirPath),
  sftpReadFile: (locationId: string, filePath: string) =>
    ipcRenderer.invoke('sftp:read-file', locationId, filePath),
  sftpStat: (locationId: string, filePath: string) =>
    ipcRenderer.invoke('sftp:stat', locationId, filePath),

  // ── Agents ──
  agentList: (locationId: string) => ipcRenderer.invoke('agent:list', locationId),
  agentConnect: (locationId: string) => ipcRenderer.invoke('agent:connect', locationId),
  agentDisconnect: (locationId: string) => ipcRenderer.invoke('agent:disconnect', locationId),
  agentSessions: (locationId: string) => ipcRenderer.invoke('agent:sessions', locationId),
  agentChatHistory: (locationId: string, sessionKey: string) =>
    ipcRenderer.invoke('agent:chat-history', locationId, sessionKey),
  agentSend: (agentId: string, locationId: string, content: string) =>
    ipcRenderer.invoke('agent:send', agentId, locationId, content),
  onAgentMessage: (agentId: string, callback: (message: unknown) => void) => {
    const channel = `agent:on-message:${agentId}`
    const listener = (_event: Electron.IpcRendererEvent, message: unknown): void => callback(message)
    ipcRenderer.on(channel, listener)
    return (): void => { ipcRenderer.removeListener(channel, listener) }
  },
  onAgentsUpdated: (callback: (locationId: string, agents: unknown[]) => void) => {
    const channel = 'agent:agents-updated'
    const listener = (_event: Electron.IpcRendererEvent, locationId: string, agents: unknown[]): void =>
      callback(locationId, agents)
    ipcRenderer.on(channel, listener)
    return (): void => { ipcRenderer.removeListener(channel, listener) }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
