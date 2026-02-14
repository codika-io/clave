export interface SessionInfo {
  id: string
  cwd: string
  folderName: string
  alive: boolean
}

export interface ElectronAPI {
  spawnSession: (cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean }) => Promise<SessionInfo>
  writeSession: (id: string, data: string) => void
  resizeSession: (id: string, cols: number, rows: number) => void
  killSession: (id: string) => Promise<void>
  listSessions: () => Promise<SessionInfo[]>
  onSessionData: (id: string, callback: (data: string) => void) => () => void
  onSessionExit: (id: string, callback: (exitCode: number) => void) => () => void
  openExternal: (url: string) => Promise<void>
  openFolderDialog: () => Promise<string | null>
  onUpdateDownloaded: (callback: (version: string) => void) => () => void
  installUpdate: () => Promise<void>
  getPathForFile: (file: File) => string
  showNotification: (options: { title: string; body: string; sessionId: string }) => Promise<void>
  onNotificationClicked: (callback: (sessionId: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
