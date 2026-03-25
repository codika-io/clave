export type Theme = 'dark' | 'light' | 'coffee'

export type AppIcon = 'dark' | 'light' | 'claude'

export type ActivityStatus = 'active' | 'idle' | 'ended'

export type SessionType = 'local' | 'remote-terminal' | 'remote-claude' | 'agent'

export type GroupTerminalColor =
  | 'black'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'yellow'
  | 'pink'
  | 'red'
  | (string & {})

export const GROUP_TERMINAL_COLORS: GroupTerminalColor[] = [
  'black',
  'green',
  'teal',
  'blue',
  'purple',
  'yellow',
  'pink',
  'red'
]

export const TERMINAL_COLOR_VALUES: Record<string, string> = {
  black: '#3A3A3C',
  green: '#34C759',
  teal: '#5AC8FA',
  blue: '#007AFF',
  purple: '#AF52DE',
  yellow: '#FFD60A',
  pink: '#FF6482',
  red: '#FF3B30'
}

/** Resolve a color name or custom hex string to its hex value */
export function resolveColorHex(color: GroupTerminalColor | null | undefined): string | undefined {
  if (!color) return undefined
  if (color in TERMINAL_COLOR_VALUES) return TERMINAL_COLOR_VALUES[color]
  if (color.startsWith('#')) return color
  return undefined
}

export type GroupTerminalIcon =
  | 'terminal'
  | 'fire'
  | 'bolt'
  | 'rocket'
  | 'eye'
  | 'globe'
  | 'cube'
  | 'heart'
  | 'star'
  | 'user'
  | 'shield'
  | 'wrench'
  | 'beaker'
  | 'cpu'
  | 'signal'
  | 'bug'
  | 'sparkles'
  | 'cloud'

export const GROUP_TERMINAL_ICONS: GroupTerminalIcon[] = [
  'terminal',
  'fire',
  'bolt',
  'rocket',
  'eye',
  'globe',
  'cube',
  'heart',
  'star',
  'user',
  'shield',
  'wrench',
  'beaker',
  'cpu',
  'signal',
  'bug',
  'sparkles',
  'cloud'
]

export interface GroupTerminalConfig {
  id: string
  command: string
  commandMode: 'prefill' | 'auto'
  color: GroupTerminalColor
  icon?: GroupTerminalIcon
  autoLaunchLocalhost?: boolean
  sessionId: string | null
}

export interface Session {
  id: string
  cwd: string
  folderName: string
  name: string
  alive: boolean
  activityStatus: ActivityStatus
  promptWaiting: string | null
  claudeMode: boolean
  dangerousMode: boolean
  claudeSessionId: string | null
  locationId?: string
  shellId?: string
  sessionType: SessionType
  agentId?: string
  detectedUrl: string | null
  hasUnseenActivity: boolean
  userRenamed: boolean
}

export interface SessionGroup {
  id: string
  name: string
  sessionIds: string[]
  collapsed: boolean
  cwd: string | null
  terminals: GroupTerminalConfig[]
  color?: GroupTerminalColor | null
}

export interface FileTab {
  id: string
  filePath: string
  name: string
}

export type ActiveView = 'terminals' | 'board' | 'usage' | 'settings' | 'agents'

export interface PinnedGroupSession {
  cwd: string
  name: string
  claudeMode: boolean
  dangerousMode: boolean
}

export interface PinnedGroupTerminal {
  command: string
  commandMode: 'prefill' | 'auto'
  color: GroupTerminalColor
  icon?: GroupTerminalIcon
  autoLaunchLocalhost?: boolean
}

export interface PinnedGroup {
  id: string
  name: string
  cwd: string | null
  color: GroupTerminalColor | null
  sessions: PinnedGroupSession[]
  terminals: PinnedGroupTerminal[]
  createdAt: number
  filePath?: string | null
  groupIndex?: number  // Position in multi-group .clave file (0-based)
  toolbar?: boolean    // Show this group's terminals as toolbar quick-actions
  logo?: string | null // Absolute path to logo image
  // Runtime state (not persisted)
  activeGroupId: string | null
  visible: boolean
}
