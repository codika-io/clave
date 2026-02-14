export interface SessionInfo {
  id: string
  cwd: string
  folderName: string
  alive: boolean
}

export interface DirEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

export interface FileStat {
  type: 'file' | 'directory'
  size: number
  modified: number
}

export interface FileReadResult {
  content: string
  truncated: boolean
  size: number
  binary: boolean
}

export interface BoardTask {
  id: string
  title: string
  prompt: string
  cwd: string
  status: 'todo' | 'processing' | 'done'
  sessionId: string | null
  createdAt: number
  updatedAt: number
  order: number
}

export interface BoardData {
  tasks: BoardTask[]
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
  listFiles: (cwd: string) => Promise<{ files: string[]; truncated: boolean }>
  readDir: (rootCwd: string, dirPath: string) => Promise<DirEntry[]>
  readFile: (rootCwd: string, filePath: string) => Promise<FileReadResult>
  statFile: (rootCwd: string, filePath: string) => Promise<FileStat>
  showItemInFolder: (fullPath: string) => Promise<void>
  boardLoad: () => Promise<BoardData>
  boardSave: (data: BoardData) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
