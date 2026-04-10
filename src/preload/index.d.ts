export interface ClaveFileGroupData {
  name: string
  cwd: string
  color: string | null
  toolbar?: boolean
  category?: string
  logo?: string
  sessions: { cwd: string; name: string; claudeMode: boolean; dangerousMode: boolean }[]
  terminals: { command: string; commandMode: 'prefill' | 'auto'; color: string; icon?: string; autoLaunchLocalhost?: boolean }[]
}

export type ClaveFileReadResult =
  | ({ type: 'single' } & ClaveFileGroupData)
  | { type: 'multi'; groups: ClaveFileGroupData[] }

export interface ClaveFileWriteData {
  name?: string
  cwd?: string | null
  color?: string | null
  sessions?: { cwd: string; name: string; claudeMode: boolean; dangerousMode: boolean }[]
  terminals?: { command: string; commandMode: 'prefill' | 'auto'; color: string; icon?: string }[]
  groups?: Array<{
    name: string
    cwd: string | null
    color: string | null
    toolbar?: boolean
    category?: string
    logo?: string
    sessions: { cwd: string; name: string; claudeMode: boolean; dangerousMode: boolean }[]
    terminals: { command: string; commandMode: 'prefill' | 'auto'; color: string; icon?: string; autoLaunchLocalhost?: boolean }[]
  }>
}

export interface SessionInfo {
  id: string
  cwd: string
  folderName: string
  alive: boolean
  claudeSessionId: string | null
}

export interface ClaudeHistoryProject {
  id: string
  name: string
  cwd: string
  storagePath: string
  encodedName: string
  sessionCount: number
  lastModified: string
}

export interface ClaudeHistorySession {
  id: string
  projectId: string
  projectName: string
  sessionId: string
  sourcePath: string
  cwd: string
  title: string
  summary: string
  createdAt: string
  lastModified: string
  messageCount: number
}

export interface ClaudeHistoryMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'tool' | 'system' | 'unknown'
  content: string
  timestamp: string
}

export interface ClaudeHistorySearchResult {
  id: string
  projectId: string
  projectName: string
  sessionId: string
  sessionTitle: string
  sourcePath: string
  messageId: string
  role: 'user' | 'assistant' | 'tool' | 'system' | 'unknown'
  preview: string
  content: string
  timestamp: string
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
  dangerousMode: boolean
  createdAt: number
  updatedAt: number
}

export interface BoardData {
  tasks: BoardTask[]
}

export interface JournalEntryData {
  sessionId: string
  claudeSessionId?: string
  sessionName: string
  summary?: string
  startTime: number
  endTime?: number
  status: 'active' | 'completed'
}

export interface JournalProjectData {
  cwd: string
  name: string
  entries: JournalEntryData[]
}

export interface JournalData {
  date: string
  projects: JournalProjectData[]
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
  repoRoot: string
}

export interface GitCommitResult {
  hash: string
  branch: string
}

export interface GitLogEntry {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  refs: string[]
}

export interface GitCommitFileStatus {
  path: string
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T'
  insertions: number
  deletions: number
}

export interface GitPushGroup {
  id: string
  pushedAt: string
  commits: GitLogEntry[]
  summary?: {
    title: string
    description: string
  }
}

export interface GitJourneyResult {
  local: GitLogEntry[]
  pushGroups: GitPushGroup[]
  fallbackMode: boolean
  branch: string
  hasMore: boolean
}

export type MagicSyncStep = 'pulling' | 'staging' | 'generating' | 'committing' | 'pushing'
export type MagicPullStep = 'fetching' | 'pulling'

export interface MagicSyncResult {
  repoPath: string
  actions: string[]
  error: string | null
}

export interface MagicPullResult {
  repoPath: string
  pulled: boolean
  error: string | null
}

export interface LaunchTemplateSession {
  id: string
  cwd: string
  name: string
  claudeMode: boolean
  dangerousMode: boolean
}

export interface LaunchTemplateGroupTerminal {
  id: string
  command: string
  commandMode: 'prefill' | 'auto'
  color: string
}

export interface LaunchTemplateGroup {
  id: string
  name: string
  sessionIds: string[]
  collapsed?: boolean
  cwd?: string | null
  terminals?: LaunchTemplateGroupTerminal[]
  command?: string | null
  commandMode?: 'prefill' | 'auto'
}

export interface LaunchTemplate {
  id: string
  name: string
  sessions: LaunchTemplateSession[]
  groups: LaunchTemplateGroup[]
  displayOrder: string[]
  createdAt: number
  updatedAt: number
}

export interface LaunchTemplatesData {
  templates: LaunchTemplate[]
  defaultTemplateId: string
}

export interface ValidationResult {
  valid: LaunchTemplateSession[]
  missing: LaunchTemplateSession[]
}

export interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface ElectronAPI {
  spawnSession: (cwd: string, options?: { dangerousMode?: boolean; claudeMode?: boolean; resumeSessionId?: string; claudeSessionId?: string; initialCommand?: string; autoExecute?: boolean }) => Promise<SessionInfo>
  writeSession: (id: string, data: string) => void
  resizeSession: (id: string, cols: number, rows: number) => void
  killSession: (id: string) => Promise<void>
  listSessions: () => Promise<SessionInfo[]>
  onSessionData: (id: string, callback: (data: string) => void) => () => void
  onSessionExit: (id: string, callback: (exitCode: number) => void) => () => void
  onSessionAutoTitle: (sessionId: string, callback: (title: string) => void) => () => void
  onPlanDetected: (sessionId: string, callback: (planPath: string) => void) => () => void
  onClearDetected: (sessionId: string, callback: () => void) => () => void
  saveDiscussion: (cwd: string, claudeSessionId: string, sessionName: string) => Promise<{ success: boolean; error?: string }>
  savePlan: (cwd: string, claudeSessionId: string, sessionName: string) => Promise<{ success: boolean; error?: string }>
  historyListProjects: () => Promise<ClaudeHistoryProject[]>
  historyLoadSessions: (projectId: string) => Promise<ClaudeHistorySession[]>
  historyLoadMessages: (sourcePath: string) => Promise<ClaudeHistoryMessage[]>
  historySearch: (query: string, roleFilter?: 'all' | 'user' | 'assistant') => Promise<ClaudeHistorySearchResult[]>
  openExternal: (url: string) => Promise<void>
  checkPort: (port: number) => Promise<boolean>
  openPath: (filePath: string) => Promise<string>
  openFolderDialog: () => Promise<string | null>
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateDownloaded: (callback: (version: string) => void) => () => void
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
  onDownloadError: (callback: (message: string) => void) => () => void
  setAppIcon: (icon: string) => Promise<void>
  getUsername: () => Promise<string | null>
  getAppVersion: () => Promise<string>
  installUpdate: () => Promise<void>
  startDownload: () => Promise<void>
  cancelDownload: () => Promise<void>
  getPathForFile: (file: File) => string
  showNotification: (options: { title: string; body: string; sessionId: string }) => Promise<void>
  onNotificationClicked: (callback: (sessionId: string) => void) => () => void
  listFiles: (cwd: string) => Promise<{ files: string[]; truncated: boolean }>
  readDir: (rootCwd: string, dirPath: string) => Promise<DirEntry[]>
  readFile: (rootCwd: string, filePath: string) => Promise<FileReadResult>
  statFile: (rootCwd: string, filePath: string) => Promise<FileStat>
  writeFile: (rootCwd: string, filePath: string, content: string) => Promise<void>
  createFile: (rootCwd: string, filePath: string) => Promise<void>
  createDirectory: (rootCwd: string, dirPath: string) => Promise<void>
  showItemInFolder: (fullPath: string) => Promise<void>
  watchDir: (cwd: string) => Promise<void>
  unwatchDir: () => Promise<void>
  onFsChanged: (callback: (cwd: string, changedDirs: string[]) => void) => () => void
  boardLoad: () => Promise<BoardData>
  boardSave: (data: BoardData) => Promise<void>
  journalLoad: () => Promise<JournalData>
  journalSave: (data: JournalData) => Promise<void>
  journalArchive: (data: JournalData) => Promise<void>
  journalSummarize: (claudeSessionId: string, cwd: string) => Promise<string | null>
  templatesLoad: () => Promise<LaunchTemplatesData>
  templatesSave: (data: LaunchTemplatesData) => Promise<void>
  templatesValidate: (template: LaunchTemplate) => Promise<ValidationResult>
  getUsageStats: () => Promise<UsageData>
  gitCheckIgnored: (cwd: string, paths: string[]) => Promise<string[]>
  getGitStatus: (cwd: string) => Promise<GitStatusResult>
  gitFetch: (cwd: string) => Promise<void>
  discoverGitRepos: (cwd: string) => Promise<Array<{ name: string; path: string }>>
  gitStage: (cwd: string, files: string[]) => Promise<void>
  gitUnstage: (cwd: string, files: string[]) => Promise<void>
  gitCommit: (cwd: string, message: string) => Promise<GitCommitResult>
  gitPush: (cwd: string) => Promise<void>
  gitPull: (cwd: string, strategy?: 'auto' | 'merge' | 'rebase' | 'ff-only') => Promise<void>
  gitDiscard: (cwd: string, files: Array<{ path: string; status: string; staged: boolean }>) => Promise<void>
  gitDiff: (cwd: string, filePath: string, staged: boolean, isUntracked: boolean) => Promise<string>
  gitLog: (cwd: string, maxCount?: number) => Promise<GitLogEntry[]>
  gitOutgoingCommits: (cwd: string) => Promise<GitLogEntry[]>
  gitIncomingCommits: (cwd: string) => Promise<GitLogEntry[]>
  gitCommitFiles: (cwd: string, hash: string) => Promise<GitCommitFileStatus[]>
  gitCommitDiff: (cwd: string, hash: string, filePath: string) => Promise<string>
  gitGenerateCommitMessage: (cwd: string) => Promise<string>
  gitMagicSync: (repoPaths: string[]) => Promise<MagicSyncResult[]>
  onMagicSyncProgress: (callback: (repoPath: string, step: MagicSyncStep) => void) => () => void
  gitMagicPull: (repoPaths: string[]) => Promise<MagicPullResult[]>
  onMagicPullProgress: (callback: (repoPath: string, step: MagicPullStep) => void) => () => void
  gitJourney: (cwd: string, maxCount?: number) => Promise<GitJourneyResult>
  gitSummarizePush: (cwd: string, commitMessages: string[], diffStats: string) => Promise<{ title: string; description: string }>

  // Locations
  locationList: () => Promise<import('../shared/remote-types').Location[]>
  locationAdd: (loc: unknown, password?: string) => Promise<import('../shared/remote-types').Location>
  locationUpdate: (id: string, updates: unknown) => Promise<void>
  locationRemove: (id: string) => Promise<void>
  locationTestConnection: (id: string) => Promise<{ success: boolean; error?: string; openclawVersion?: string; openclawPort?: number; openclawToken?: string }>
  locationInstallPlugin: (id: string) => Promise<{ success: boolean; output?: string; error?: string }>

  // SSH / Remote Terminal
  sshConnect: (locationId: string) => Promise<void>
  sshDisconnect: (locationId: string) => Promise<void>
  sshExec: (locationId: string, command: string) => Promise<{ stdout: string; stderr: string; code: number }>
  sshOpenShell: (locationId: string, cwd?: string) => Promise<string>
  sshShellWrite: (shellId: string, data: string) => void
  sshShellResize: (shellId: string, cols: number, rows: number) => void
  sshShellClose: (shellId: string) => Promise<void>
  onSshShellData: (shellId: string, callback: (data: string) => void) => () => void
  onSshShellExit: (shellId: string, callback: (exitCode: number) => void) => () => void
  onSshConnectionClosed: (callback: (locationId: string) => void) => () => void

  // Remote FS (SFTP)
  sftpReadDir: (locationId: string, dirPath: string) => Promise<import('../shared/remote-types').RemoteDirEntry[]>
  sftpReadFile: (locationId: string, filePath: string) => Promise<string>
  sftpStat: (locationId: string, filePath: string) => Promise<{ isDirectory: boolean; isFile: boolean; size: number; mtime: number }>

  // Agents
  agentList: (locationId: string) => Promise<import('../shared/remote-types').Agent[]>
  agentConnect: (locationId: string) => Promise<void>
  agentDisconnect: (locationId: string) => Promise<void>
  agentSessions: (locationId: string) => Promise<unknown>
  agentChatHistory: (locationId: string, sessionKey: string) => Promise<unknown>
  agentSend: (agentId: string, locationId: string, content: string) => Promise<import('../shared/remote-types').ChatMessage>
  onAgentMessage: (agentId: string, callback: (message: unknown) => void) => () => void
  onAgentsUpdated: (callback: (locationId: string, agents: unknown[]) => void) => () => void

  // .clave files
  readClaveFile: (absolutePath: string, rootDir?: string) => Promise<ClaveFileReadResult | null>
  writeClaveFile: (absolutePath: string, data: ClaveFileWriteData, rootDir?: string) => Promise<void>
  watchClaveFile: (absolutePath: string) => Promise<void>
  unwatchClaveFile: (absolutePath: string) => Promise<void>
  onClaveFileChanged: (callback: (filePath: string) => void) => () => void
  saveFileDialog: (defaultName: string, filters: { name: string; extensions: string[] }[]) => Promise<string | null>
  getDownloadsPath: () => Promise<string>
  getUserDataPath: () => Promise<string>
  claveFileExists: (absolutePath: string) => Promise<boolean>
  discoverClaveFiles: (folderPath: string) => Promise<{ name: string; path: string; rootDir: string | null }[]>
  discoverClaveFilesRecursive: (rootDir: string, config?: { patterns?: string[]; exclude?: string[]; maxDepth?: number; workspaceId?: string }) => Promise<{ name: string; path: string; rootDir: string }[]>
  readAutoDiscoverConfig: (filePath: string) => Promise<{ enabled: boolean; patterns?: string[]; exclude?: string[]; maxDepth?: number } | null>
  readImageAsDataUrl: (absolutePath: string) => Promise<string | null>
  preferencesGet: (key: string) => Promise<unknown>
  preferencesSet: (key: string, value: unknown) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
