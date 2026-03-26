import { contextBridge, ipcRenderer, webUtils } from 'electron'

/** Creates a typed IPC event listener with cleanup function. */
function createIpcListener<T extends unknown[]>(
  channel: string,
  callback: (...args: T) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: T): void =>
    callback(...args)
  ipcRenderer.on(channel, listener)
  return (): void => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const electronAPI = {
  spawnSession: (cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean; resumeSessionId?: string; initialCommand?: string; autoExecute?: boolean }) =>
    ipcRenderer.invoke('pty:spawn', cwd, options),

  writeSession: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),

  resizeSession: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('pty:resize', id, cols, rows),

  killSession: (id: string) => ipcRenderer.invoke('pty:kill', id),

  listSessions: () => ipcRenderer.invoke('pty:list'),

  onSessionData: (id: string, callback: (data: string) => void) =>
    createIpcListener<[string]>(`pty:data:${id}`, callback),

  onSessionExit: (id: string, callback: (exitCode: number) => void) =>
    createIpcListener<[number]>(`pty:exit:${id}`, callback),

  onSessionAutoTitle: (sessionId: string, callback: (title: string) => void) =>
    createIpcListener<[string]>(`session:auto-title:${sessionId}`, callback),

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  checkPort: (port: number) =>
    ipcRenderer.invoke('net:check-port', port) as Promise<boolean>,

  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),

  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  onUpdateAvailable: (callback: (version: string) => void) =>
    createIpcListener<[string]>('updater:update-available', callback),

  onUpdateDownloaded: (callback: (version: string) => void) =>
    createIpcListener<[string]>('updater:update-downloaded', callback),

  onDownloadProgress: (
    callback: (progress: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }) => void
  ) => createIpcListener<[{ percent: number; bytesPerSecond: number; transferred: number; total: number }]>(
    'updater:download-progress',
    callback
  ),

  onDownloadError: (callback: (message: string) => void) =>
    createIpcListener<[string]>('updater:download-error', callback),

  setAppIcon: (icon: string) => ipcRenderer.invoke('app:set-icon', icon),
  getUsername: () => ipcRenderer.invoke('app:get-username') as Promise<string | null>,
  saveAvatar: (sourcePath: string) => ipcRenderer.invoke('app:save-avatar', sourcePath) as Promise<string | null>,

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
  onFsChanged: (callback: (cwd: string, changedDirs: string[]) => void) =>
    createIpcListener<[string, string[]]>('fs:changed', callback),

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
  gitMagicSync: (repoPaths: string[]) =>
    ipcRenderer.invoke('git:magic-sync', repoPaths),
  onMagicSyncProgress: (callback: (repoPath: string, step: string) => void) =>
    createIpcListener<[string, string]>('git:magic-sync-progress', callback),

  showNotification: (options: { title: string; body: string; sessionId: string }) =>
    ipcRenderer.invoke('notification:show', options),

  onNotificationClicked: (callback: (sessionId: string) => void) =>
    createIpcListener<[string]>('notification:clicked', callback),

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
  sshExec: (locationId: string, command: string) =>
    ipcRenderer.invoke('ssh:exec', locationId, command),
  sshShellClose: (shellId: string) => ipcRenderer.invoke('ssh:shell-close', shellId),
  onSshShellData: (shellId: string, callback: (data: string) => void) =>
    createIpcListener<[string]>(`ssh:shell-data:${shellId}`, callback),
  onSshShellExit: (shellId: string, callback: (exitCode: number) => void) =>
    createIpcListener<[number]>(`ssh:shell-exit:${shellId}`, callback),
  onSshConnectionClosed: (callback: (locationId: string) => void) =>
    createIpcListener<[string]>('ssh:connection-closed', callback),

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
  onAgentMessage: (agentId: string, callback: (message: unknown) => void) =>
    createIpcListener<[unknown]>(`agent:on-message:${agentId}`, callback),
  onAgentsUpdated: (callback: (locationId: string, agents: unknown[]) => void) =>
    createIpcListener<[string, unknown[]]>('agent:agents-updated', callback),

  // ── .clave files ──
  readClaveFile: (absolutePath: string, rootDir?: string) =>
    ipcRenderer.invoke('clave:read-file', absolutePath, rootDir),
  writeClaveFile: (absolutePath: string, data: unknown, rootDir?: string) =>
    ipcRenderer.invoke('clave:write-file', absolutePath, data, rootDir),
  watchClaveFile: (absolutePath: string) =>
    ipcRenderer.invoke('clave:watch-file', absolutePath),
  unwatchClaveFile: (absolutePath: string) =>
    ipcRenderer.invoke('clave:unwatch-file', absolutePath),
  onClaveFileChanged: (callback: (filePath: string) => void) =>
    createIpcListener<[string]>('clave:file-changed', callback),
  saveFileDialog: (defaultName: string, filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('dialog:saveFile', defaultName, filters),
  getDownloadsPath: () => ipcRenderer.invoke('app:get-downloads-path') as Promise<string>,
  getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path') as Promise<string>,
  claveFileExists: (absolutePath: string) =>
    ipcRenderer.invoke('clave:file-exists', absolutePath) as Promise<boolean>,
  discoverClaveFiles: (folderPath: string) =>
    ipcRenderer.invoke('clave:discover-files', folderPath) as Promise<{ name: string; path: string; rootDir: string | null }[]>,
  readImageAsDataUrl: (absolutePath: string) =>
    ipcRenderer.invoke('clave:read-image', absolutePath) as Promise<string | null>,
  preferencesGet: (key: string) =>
    ipcRenderer.invoke('preferences:get', key),
  preferencesSet: (key: string, value: unknown) =>
    ipcRenderer.invoke('preferences:set', key, value)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
