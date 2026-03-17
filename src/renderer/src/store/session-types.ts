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

export interface GroupTerminalConfig {
  id: string
  command: string
  commandMode: 'prefill' | 'auto'
  color: GroupTerminalColor
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
