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
  claudeSessionId: string | null
  createdAt: number
  updatedAt: number
  order: number
}

export interface BoardTemplate {
  id: string
  name: string
  title: string
  prompt: string
  cwd: string | null
  createdAt: number
}

export interface BoardData {
  tasks: BoardTask[]
  templates: BoardTemplate[]
}

export interface ModelTokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export interface UsageData {
  dailyActivity: { date: string; messageCount: number; sessionCount: number; toolCallCount: number }[]
  dailyModelTokens: { date: string; tokensByModel: Record<string, number> }[]
  modelUsage: Record<string, ModelTokenUsage>
  totalSessions: number
  totalMessages: number
  firstSessionDate: string | null
  hourCounts: Record<string, number>
  estimatedCost: number
  totalTokens: number
  rateLimits: RateLimits | null
}

export interface RateLimitEntry {
  label: string
  percent: number
  resetInfo: string
}

export interface RateLimits {
  entries: RateLimitEntry[]
  fetchedAt: number
}

export interface GitFileStatus {
  path: string
  status:
    | 'staged'
    | 'modified'
    | 'deleted'
    | 'untracked'
    | 'staged-modified'
    | 'staged-deleted'
    | 'renamed'
  staged: boolean
}

export interface GitStatusResult {
  isRepo: boolean
  branch: string
  ahead: number
  behind: number
  files: GitFileStatus[]
}

export interface GitCommitResult {
  hash: string
  branch: string
}

export interface ElectronAPI {
  spawnSession: (cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean; resumeSessionId?: string }) => Promise<SessionInfo>
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
  onClaudeSessionDetected: (sessionId: string, callback: (claudeSessionId: string) => void) => () => void
  onNotificationClicked: (callback: (sessionId: string) => void) => () => void
  listFiles: (cwd: string) => Promise<{ files: string[]; truncated: boolean }>
  readDir: (rootCwd: string, dirPath: string) => Promise<DirEntry[]>
  readFile: (rootCwd: string, filePath: string) => Promise<FileReadResult>
  statFile: (rootCwd: string, filePath: string) => Promise<FileStat>
  showItemInFolder: (fullPath: string) => Promise<void>
  boardLoad: () => Promise<BoardData>
  boardSave: (data: BoardData) => Promise<void>
  getUsageStats: () => Promise<UsageData>
  fetchRateLimits: () => Promise<RateLimits | null>
  getGitStatus: (cwd: string) => Promise<GitStatusResult>
  gitStage: (cwd: string, files: string[]) => Promise<void>
  gitUnstage: (cwd: string, files: string[]) => Promise<void>
  gitCommit: (cwd: string, message: string) => Promise<GitCommitResult>
  gitPush: (cwd: string) => Promise<void>
  gitPull: (cwd: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
