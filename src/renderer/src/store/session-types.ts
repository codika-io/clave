export type Theme = 'dark' | 'light' | 'coffee'

export type AppIcon = 'dark' | 'light' | 'claude'

export type ActivityStatus = 'active' | 'idle' | 'ended'

/**
 * Deterministic Claude Code run state, sourced from CC lifecycle hooks (see
 * main/agent-state-manager.ts). Drives the sidebar tab status visuals for Claude
 * sessions only — other providers stay neutral. `ended` is derived from `alive`
 * at render time, so the hook-fed values are idle/working/blocked/done.
 */
export type AgentRunState = 'idle' | 'working' | 'blocked' | 'done'

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
  black: '#95979c',
  green: '#4cb782',
  teal: '#53b7c5',
  blue: '#5e6ad2',
  purple: '#8b95a8',
  yellow: '#e8b931',
  pink: '#db8b4e',
  red: '#d45461'
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
  cwd?: string | null
  autoLaunchLocalhost?: boolean
  /** Declared dev-server URL (e.g. "http://localhost:3000"). On toolbar buttons
   *  this enables probe-first "ensure running, then open" (see use-server-button.ts).
   *  On a sidebar group terminal it is what `groupView` binds. */
  serverUrl?: string
  /** This terminal's `serverUrl` is the group's web view: the page the user sees
   *  when clicking the group, with this terminal as its start action. Declared in
   *  a `.clave` file (bound at launch) or by `clave_add_group_terminal`; carried
   *  on the live config so a pin resync never drops it from the file. */
  groupView?: boolean
  sessionId: string | null
}

export type ServerStatus = 'running' | 'stopped' | 'starting' | null

export interface Session {
  id: string
  cwd: string
  folderName: string
  name: string
  alive: boolean
  activityStatus: ActivityStatus
  /** Deterministic Claude run state from CC hooks; undefined until first signal. */
  agentState?: AgentRunState
  promptWaiting: string | null
  claudeMode: boolean
  antigravityMode: boolean
  codexMode: boolean
  /** Claude session launched via the `claude agents` subcommand. */
  claudeAgentsMode?: boolean
  dangerousMode: boolean
  /** Model this session was launched on (claude/codex modes), so Duplicate and
   *  restore keep it. Undefined = the CLI's default; /model inside the session
   *  can diverge from it afterwards without Clave knowing. */
  model?: string
  /** Session id of the tab whose agent opened this one via clave_open_session,
   *  so the child can target "parent" in clave_send_to_session /
   *  clave_read_session. Session-lifetime only: not persisted to the tmux
   *  sidecar, so the link is gone after an app restart. */
  spawnedBy?: string
  claudeSessionId: string | null
  /** Claude account/profile this session runs under (issue #22). Undefined =
   *  the Default profile. `claudeProfileLabel` drives the session-header badge. */
  claudeProfileId?: string
  claudeProfileLabel?: string
  claudeConfigDir?: string
  /** One-shot prompt this session was launched with (agent modes only), so
   *  Duplicate can re-prime the clone. Not persisted to the tmux sidecar, so a
   *  session re-adopted after an app restart loses it (the resumed conversation
   *  already contains the prompt + response) — an accepted, documented edge. */
  initialPrompt?: string
  locationId?: string
  shellId?: string
  sessionType: SessionType
  agentId?: string
  detectedUrl: string | null
  serverStatus: ServerStatus
  serverCommand: string | null
  /** Attached web view (see SessionViewConfig). Shown in the main pane via the
   *  row's dashboard icon; the row click itself still shows the terminal.
   *  Persisted in the session's record (main process) so it survives restart. */
  view?: SessionViewConfig | null
  hasUnseenActivity: boolean
  /** Name of another tab whose agent injected a message into this one via
   *  clave_send_to_session, set on delivery and cleared when the tab is viewed.
   *  Drives a distinct sidebar marker so a cross-tab message is never silent. */
  injectedFrom?: string | null
  userRenamed: boolean
  planFilePath: string | null
  /** Workspace this session belongs to, stamped at spawn from the then-active
   *  workspace (or inherited: duplicate/resume take the source session's, pin
   *  launches the pin's, MCP spawns the caller's). Persisted in the session
   *  record so it survives restarts. Undefined = unstamped → visible in every
   *  workspace (no-workspace mode and the legacy safety net). */
  workspaceId?: string
}

/** A web page attached to a group: clicking the group shows this rendered page
 *  in the main pane instead of the tiled session mosaic. `url` is an http(s)
 *  URL (a dev server, a workstream dashboard) or an absolute .html file path
 *  (rendered via the clave-preview protocol). `terminalId` links the group
 *  terminal that serves the URL, powering the down-state "start server" action. */
export interface GroupViewConfig {
  url: string
  title?: string
  terminalId?: string | null
}

/** A session's attached web view — the fast-lane case: a workstream dashboard
 *  or any served page belonging to ONE tab, with no group around it. The
 *  serving process is a hidden linked session (`serverSessionId`), respawnable
 *  from `command`/`cwd` when the probe finds the page down — so the view
 *  carries its own start action exactly like a group view's linked terminal. */
export interface SessionViewConfig {
  url: string
  title?: string
  /** Command that serves `url`; the start action when the probe says down. */
  command?: string
  /** Working directory for `command` (defaults to the owning session's cwd). */
  cwd?: string
  /** The hidden serving session, when one is running. Never persisted — a
   *  restart leaves it null and the start action respawns from `command`. */
  serverSessionId?: string | null
}

export interface SessionGroup {
  id: string
  name: string
  sessionIds: string[]
  collapsed: boolean
  cwd: string | null
  terminals: GroupTerminalConfig[]
  /** Default prompt new sessions launched from this group's `+` inherit.
   *  Set from the group's `.clave` entry when the group was stamped out of a
   *  pin, or by an agent through `clave_create_group`. There is no UI to edit it
   *  on a live group. Null/absent = the `+` launches with no prompt, exactly
   *  like the sidebar's own agent button. */
  prompt?: string | null
  /** The `+` starts its session at the WORKSPACE ROOT instead of the group's
   *  `cwd`. Stamped from the `.clave` entry session that gave this group its
   *  brief (`rootSession: true`) — the `+` reproduces that session, so a tab
   *  opened an hour later lands where the group's own tabs did. `cwd` still
   *  names the project dir the prompt's @-tokens resolve against. */
  rootSession?: boolean
  color?: GroupTerminalColor | null
  /** Attached web view — persists with the group (serialized whole). */
  view?: GroupViewConfig | null
  /** Workspace this group belongs to (see Session.workspaceId). Persists via
   *  sidebar-layout.json since groups are serialized whole. */
  workspaceId?: string
}

export interface FileTabDiffInfo {
  type: 'working' | 'commit'
  cwd: string
  file: string
  staged: boolean
  fileStatus: string
  hash: string | null
}

export interface FileTab {
  id: string
  filePath: string
  name: string
  kind?: 'file' | 'diff'
  diff?: FileTabDiffInfo
  /** Requested view mode for .html files (e.g. an agent opening one rendered
   *  via clave_open_file). Undefined = the file kind's default. */
  view?: 'rendered' | 'source'
}

export type ActiveView = 'terminals' | 'settings' | 'agents' | 'extensions'

export type SettingsSection = 'general' | 'appearance' | 'updates' | 'usage'

export type ExtensionsSection = 'marketplaces' | 'mcp'

export interface PinnedGroupSession {
  cwd: string
  name: string
  claudeMode: boolean
  antigravityMode: boolean
  codexMode: boolean
  claudeAgentsMode?: boolean
  dangerousMode: boolean
  /** One-shot initial prompt auto-submitted to the agent on launch. Agent modes
   *  only (claude/antigravity/codex) — ignored for plain terminals and the
   *  `claude agents` subcommand. May contain @root_path / @project_path /
   *  @project_abs tokens (substituted at spawn when the pin knows its workspace root). */
  prompt?: string
  /** Spawn the session at the workspace root (the dir the discovering workspace
   *  was rooted at) instead of at `cwd`. `cwd` still defines the project dir that
   *  feeds the prompt path tokens. No-op if the pin has no workspaceRoot. */
  rootSession?: boolean
}

export interface PinnedGroupTerminal {
  command: string
  commandMode: 'prefill' | 'auto'
  color: GroupTerminalColor
  icon?: GroupTerminalIcon
  cwd?: string | null
  autoLaunchLocalhost?: boolean
  persistent?: boolean
  /** Declared dev-server URL. Turns a toolbar terminal into a server button:
   *  click = probe the URL, open it if reachable, otherwise start the command
   *  and open on URL detection. Implies `persistent` for toolbar buttons. */
  serverUrl?: string
  /** In a sidebar group: bind `serverUrl` as the group's web view when the group
   *  launches (requires `serverUrl` — a view needs a page to show). */
  groupView?: boolean
}

export interface PinnedGroup {
  id: string
  name: string
  cwd: string | null
  color: GroupTerminalColor | null
  /** Group-level default prompt (`.clave` `prompt`). Inherited by sessions the
   *  live group's `+` launches; a session's own `prompt` still wins for that
   *  session. Carries the same @-tokens, substituted at spawn. */
  prompt?: string | null
  /** Group-level web view (`.clave` `view`): a page that needs no process — an
   *  http(s) URL, or an absolute .html path (resolved from the file at read).
   *  A terminal's `groupView` wins over it; see resolveDeclaredGroupView. */
  view?: string | null
  sessions: PinnedGroupSession[]
  terminals: PinnedGroupTerminal[]
  createdAt: number
  filePath?: string | null
  rootDir?: string | null  // Root dir for resolving paths (null = file's parent dir)
  workspaceRoot?: string | null  // Absolute root of the workspace that discovered this pin; feeds rootSession spawn + prompt path tokens. null = standalone import.
  groupIndex?: number  // Position in multi-group .clave file (0-based)
  toolbar?: boolean    // Show this group's terminals as toolbar quick-actions
  logo?: string | null // Absolute path to logo image
  category?: string | null // Category label for organizing pins in the sidebar
  discoveredBy?: string | null // filePath of workspace profile that auto-discovered this pin
  /** Workspace this pin belongs to. All registered workspaces' pins live in the
   *  store simultaneously; the UI filters by the active workspace. null =
   *  unscoped (no-workspace mode), visible everywhere until a workspace exists. */
  workspaceId?: string | null
  // Runtime state (not persisted)
  activeGroupId: string | null
  visible: boolean
}
