import * as pty from 'node-pty'
import { execFile, execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS, INITIAL_COMMAND_DELAY_MS } from './constants'
import { stateFilePath } from './agent-state-manager'
import { getMcpRuntime, writeSessionMcpConfig, deleteSessionMcpConfig } from './mcp/mcp-runtime'
import { workspaceManager } from './workspace-manager'
import { dismissSessionOffers } from './copy-offer-manager'

const isWindows = process.platform === 'win32'

/** Wrap a string as a single shell-quoted token (safe for embedding in `zsh -c`). */
function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * Claude session ids are UUIDs. They are interpolated into the shell command
 * string used to spawn the CLI, so a value carrying shell metacharacters (from
 * a poisoned tmux sidecar or persisted session state) would be code execution.
 * Restrict to the UUID-safe alphabet.
 */
function isValidClaudeSessionId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id)
}

/**
 * Model names are interpolated into the same shell command string as session
 * ids (same poisoned-sidecar risk), so restrict them to the alphabet real
 * model refs use: aliases ("opus"), full ids ("claude-fable-5"), and
 * provider-prefixed ids with dots, slashes, or colons (Bedrock/Vertex).
 */
function isValidModelName(model: string): boolean {
  // No `..` segment and no leading/trailing separator: keeps the value a
  // model-ref shape and not a path-traversal-looking string, even though it is
  // only ever handed to the CLI as a --model/-m value (and single-quoted on
  // POSIX). Hygiene, not the injection guard — the alphabet + no-leading-dash
  // rule is what blocks flag smuggling and shell metacharacters.
  if (model.includes('..')) return false
  return /^[A-Za-z0-9][A-Za-z0-9._/:-]{0,198}[A-Za-z0-9]$|^[A-Za-z0-9]$/.test(model)
}

/**
 * Build the `--settings` argument that wires Claude Code lifecycle hooks to a
 * per-session state file owned by agent-state-manager. Returns a fully
 * shell-quoted token ready to drop into the `zsh -lc '<cmd>'` command string,
 * or null on Windows (hooks use POSIX `printf`/`grep`; the app ships macOS-only).
 *
 * State words written: idle (start), working (prompt/tool activity), blocked
 * (permission/elicitation prompt), done (turn complete), ended (session end).
 * `--settings` merges with (never replaces) the user's own settings.
 */
function buildClaudeHookSettingsArg(claveSessionId: string): string | null {
  if (isWindows) return null
  const statePath = stateFilePath(claveSessionId)
  const q = JSON.stringify(statePath) // double-quoted shell token for the path
  // Recreate the parent dir on every write: the hook path is baked in at spawn,
  // so a vanished userData dir (cleanup script, manual delete) must not turn
  // every lifecycle hook into a visible "No such file or directory" error.
  const qDir = JSON.stringify(path.dirname(statePath))
  const write = (word: string): { hooks: { type: 'command'; command: string }[] } => ({
    hooks: [{ type: 'command', command: `mkdir -p ${qDir} && printf ${word} > ${q}` }]
  })
  const settings = {
    hooks: {
      SessionStart: [write('idle')],
      UserPromptSubmit: [write('working')],
      PreToolUse: [write('working')],
      PostToolUse: [write('working')],
      // Notification fires for both permission prompts and ~60s idle. Only the
      // permission/elicitation case is a real "blocked"; match the payload text
      // (robust to the exact field name) and ignore the idle case.
      Notification: [
        {
          hooks: [
            {
              type: 'command',
              command: `grep -qiE "permission|elicitation" && mkdir -p ${qDir} && printf blocked > ${q} || true`
            }
          ]
        }
      ],
      Stop: [write('done')],
      SessionEnd: [write('ended')]
    }
  }
  return shellSingleQuote(JSON.stringify(settings))
}

let loginShellEnv: Record<string, string> | null = null

export function getUserShell(): string {
  if (isWindows) {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

function parseEnvOutput(output: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const entry of output.split('\0')) {
    const idx = entry.indexOf('=')
    if (idx > 0) {
      env[entry.slice(0, idx)] = entry.slice(idx + 1)
    }
  }
  return env
}

/**
 * Pre-cache the login shell environment asynchronously.
 * On Windows, we just use the current process env (no login shell concept).
 * On macOS/Linux, call the login shell so that PATH and other vars are populated.
 */
export function preloadLoginShellEnv(): void {
  if (loginShellEnv !== null) return

  if (isWindows) {
    loginShellEnv = { ...process.env } as Record<string, string>
    return
  }

  execFile(getUserShell(), ['-lic', 'env -0'], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  }, (err, stdout) => {
    if (loginShellEnv !== null) return // already set by sync fallback
    if (err) {
      loginShellEnv = { ...process.env } as Record<string, string>
      return
    }
    const env = parseEnvOutput(stdout)
    loginShellEnv = Object.keys(env).length > 0 ? env : { ...process.env } as Record<string, string>
  })
}

export function getLoginShellEnv(): Record<string, string> {
  if (loginShellEnv !== null) return loginShellEnv

  if (isWindows) {
    loginShellEnv = { ...process.env } as Record<string, string>
    return loginShellEnv
  }

  // Sync fallback if async preload hasn't finished yet
  try {
    const output = execFileSync(getUserShell(), ['-lic', 'env -0'], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    })
    const env = parseEnvOutput(output)
    loginShellEnv = Object.keys(env).length > 0 ? env : { ...process.env } as Record<string, string>
  } catch {
    loginShellEnv = { ...process.env } as Record<string, string>
  }
  return loginShellEnv
}

// ---------------------------------------------------------------------------
// tmux integration (opt-in, macOS/Linux)
//
// When enabled, a session's agent runs *inside* a named tmux session. The
// node-pty process is merely the tmux client; the agent lives in the tmux
// server (a daemon), so it survives the client dying — i.e. the app quitting
// or crashing. Re-opening the same session slot reattaches the live process,
// and it can also be reached from any terminal via `tmux -L clave attach`.
// ---------------------------------------------------------------------------

/** Dedicated tmux socket so Clave's sessions never collide with the user's
 *  default tmux server (and a stray `tmux kill-server` can't nuke their work). */
const TMUX_SOCKET = 'clave'

// undefined = not probed yet, null = tmux not installed, string = absolute path
let tmuxPathCache: string | null | undefined
let tmuxConfigPathCache: string | null = null

/** Resolve tmux against the *login* shell PATH (Homebrew lives in /opt/homebrew
 *  which is usually absent from Electron's process.env.PATH). Uses the already
 *  preloaded login-shell env instead of spawning another `-lic` shell, so it
 *  doesn't block the main thread on the user's rc files. */
function detectTmux(): string | null {
  if (tmuxPathCache !== undefined) return tmuxPathCache
  if (isWindows) {
    tmuxPathCache = null
    return null
  }
  const env = getLoginShellEnv()
  const pathDirs = (env.PATH || process.env.PATH || '').split(':')
  for (const dir of pathDirs) {
    if (!dir) continue
    const candidate = path.join(dir, 'tmux')
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      tmuxPathCache = candidate
      return candidate
    } catch {
      // not here, keep looking
    }
  }
  tmuxPathCache = null
  return null
}

export function isTmuxAvailable(): boolean {
  return detectTmux() !== null
}

/** Minimal, predictable config for embedded agent terminals. Passed via `-f`
 *  so the user's ~/.tmux.conf can't change behaviour (no surprise keybindings,
 *  no `destroy-unattached on` killing our sessions, no status bar stealing a
 *  row). Truecolor is forwarded and ESC latency dropped for snappy TUIs. */
function getTmuxConfigPath(): string {
  if (tmuxConfigPathCache) return tmuxConfigPathCache
  const conf = [
    'set -g default-terminal "tmux-256color"',
    'set -as terminal-features ",xterm-256color:RGB"',
    'set -g destroy-unattached off',
    'set -g status off',
    'set -g history-limit 50000',
    'set -sg escape-time 10',
    'set -g focus-events on',
    // Mouse on, but with scrollback wiring: a bare `set -g mouse on` makes the
    // wheel send arrow keys to the shell (it mangles the prompt). Instead, the
    // wheel scrolls tmux's scrollback (entering copy-mode) unless the app inside
    // the pane wants the mouse itself (#{mouse_any_flag}), in which case we pass
    // the event through. Drag copies the selection to the macOS clipboard; scroll
    // back down (or finishing a selection) returns to the live prompt. We do NOT
    // bind MouseDown1Pane to cancel: the press fires before the drag, so canceling
    // on it jumps to the bottom and makes highlighting scrollback text impossible.
    'set -g mouse on',
    'bind -n WheelUpPane if -Ft= "#{mouse_any_flag}" "send -M" "if -Ft= \'#{pane_in_mode}\' \'send -X -N 3 scroll-up\' \'copy-mode -e\'"',
    'bind -n WheelDownPane if -Ft= "#{mouse_any_flag}" "send -M" "if -Ft= \'#{pane_in_mode}\' \'send -X -N 3 scroll-down\' \'send -M\'"',
    'bind -T copy-mode    MouseDragEnd1Pane send -X copy-pipe-and-cancel pbcopy',
    'bind -T copy-mode-vi MouseDragEnd1Pane send -X copy-pipe-and-cancel pbcopy',
    // If a second client (e.g. an external `tmux attach`) joins, follow the
    // most-recently-active client's size instead of shrinking to the smallest.
    'set -g window-size latest',
    ''
  ].join('\n')
  const p = path.join(app.getPath('userData'), 'clave.tmux.conf')
  try {
    fs.writeFileSync(p, conf, 'utf-8')
    tmuxConfigPathCache = p
  } catch {
    // Fall back to running without a config file rather than failing the spawn.
    return ''
  }
  return tmuxConfigPathCache
}

function agentModeTag(options?: PtySpawnOptions): string {
  if (options?.antigravityMode) return 'antigravity'
  if (options?.codexMode) return 'codex'
  if (options?.claudeAgentsMode) return 'agents'
  if (options?.claudeMode === false) return 'shell'
  return 'claude'
}

/** Tiny stable hash (djb2) → base36, so the same session slot maps to the same
 *  tmux session name across app restarts (enabling reattach on re-open). */
function shortHash(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i)
  }
  return (h >>> 0).toString(36).slice(0, 6)
}

/** Deterministic, human-readable, tmux-legal session name (no `.` or `:`). */
function baseTmuxName(cwd: string, modeTag: string): string {
  const folder = (cwd.split('/').pop() || 'clave')
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 24)
  return `clave-${folder}-${shortHash(`${cwd}|${modeTag}`)}`
}

// --- Sidecar metadata + orphan management -------------------------------------
//
// tmux sessions outlive the app, so the tmux server itself is our source of
// truth for "what was running". For each tmux-backed session we drop a tiny
// JSON sidecar describing how to recreate its tab. On launch the renderer asks
// for the adoptable list: we cross-check sidecars against the live tmux server,
// hand back the survivors (to be reattached as tabs), prune sidecars whose
// session is gone, and reap any stray `clave-*` session that has no sidecar —
// so nothing can pile up invisibly.

/** Who owns a session that is not a tab of its own (SessionRecord.link).
 *  The boot restore reads it to bring the session back as that half instead
 *  of as a top-level tab — see `lib/boot-adoption.ts` in the renderer, which
 *  owns the rules. */
export type SessionLink =
  /** A group's quick-launch terminal (the icons on a group row). */
  | { kind: 'group-terminal'; groupId: string; terminalId: string }
  /** The hidden process serving a single session's attached web view. */
  | { kind: 'session-view'; ownerId: string }
  /** A toolbar button's persistent terminal — never a sidebar row at all;
   *  `key` is the `${pinId}:${terminalIndex}` of the toolbar registry. */
  | { kind: 'toolbar'; key: string }

/** What the renderer needs to recreate + reattach a surviving session's tab.
 *
 *  Historically this metadata only existed for tmux-backed sessions (the
 *  "sidecar"). It is now a SESSION RECORD written for every local session,
 *  tmux or not: plain sessions can't be reattached (their process dies with
 *  the app), but the record lets the launch flow offer to RELAUNCH them —
 *  fresh shell in the same cwd, Claude conversations resumed via
 *  claudeSessionId — which is exactly the dead-tmux path that always existed. */
export interface SessionRecord {
  /** Backing tmux session, when there is one. Absent = plain record: the
   *  session runs (ran) directly on a PTY and is only ever relaunched. */
  tmuxName?: string
  /** Original PTY session id, reused on adoption so the Claude lifecycle-hook
   *  state file (keyed by this id) keeps matching after reattach. */
  id: string
  claudeSessionId?: string
  cwd: string
  folderName: string
  /** The tab label as the user sees it — a manual rename or an auto-generated
   *  title. Absent means the tab still shows `folderName`. Kept in the sidecar
   *  (not just renderer memory) so a crash or reboot can't revert the name. */
  displayName?: string
  /** True when `displayName` came from an explicit rename, which protects it
   *  from being overwritten by the auto-title generator after re-adoption. */
  userRenamed?: boolean
  claudeMode: boolean
  antigravityMode: boolean
  codexMode: boolean
  claudeAgentsMode: boolean
  dangerousMode: boolean
  /** Model the session was launched on (claude/codex), so a dead-sidecar
   *  re-spawn after a reboot relaunches the CLI on the same model. */
  model?: string
  /** Claude account/profile this session runs under, so the badge + config dir
   *  survive an app restart and re-adoption. */
  configDir?: string
  claudeProfileId?: string
  claudeProfileLabel?: string
  /** Workspace this session belongs to. Stamped at spawn from the active
   *  workspace (or an explicit caller override) and carried forward across
   *  adoption rewrites. Legacy records without it are annotated at list time
   *  by inferring from cwd against registered workspace roots. */
  workspaceId?: string
  /** The WINDOW this session lives in (PRDCT-1703): the persisted key of the
   *  window that spawned or last adopted it. At boot each window adopts its
   *  own records; a record whose window no longer exists is an orphan the
   *  primary window takes. Rewritten on every adoption, so a move between
   *  windows (detach + re-adopt) re-stamps it. Legacy records without it are
   *  orphans, adopted by the primary. */
  windowKey?: string
  /** Attached web view (renderer session.view): the page behind the row's
   *  dashboard icon, restored at adoption. The hidden serving session's id is
   *  deliberately absent — it never survives a restart; the view's start
   *  action respawns the command. Mirrors displayName: renderer state dies
   *  with the window, the record is what survives. */
  view?: { url: string; title?: string; command?: string; cwd?: string }
  /** What this session IS — absent means an ordinary tab, which is every
   *  session the user opened and every record written before this field
   *  existed. A session spawned as the hidden half of something else (a
   *  group's quick-launch terminal, a session view's serving process, a
   *  toolbar server button) carries the identity of that owner here.
   *
   *  Without it the record is indistinguishable from a tab's, and the next
   *  launch brings a dev server back as a mystery tab in the sidebar while
   *  its owner shows "not running" and starts a duplicate. The renderer's
   *  own links do not close that gap: the toolbar's is in-memory, the
   *  session view's is deliberately not persisted, and the group's lives in
   *  the sidebar layout, which drops it with the group. */
  link?: SessionLink
  /** Populated only on the listAdoptableSessions() path (not persisted in
   *  the record). True when the backing tmux session is still running (app
   *  quit/reopen, no reboot) → reattach to the live process. False when the
   *  tmux server died (e.g. a shutdown/reboot killed it) but the sidecar
   *  metadata survives → re-spawn fresh (Claude resumes via claudeSessionId). */
  live?: boolean
}

/** tmux session names we create are always `clave-<sanitized>`. Validate before
 *  using a name in a filesystem path or a kill-session call — it crosses the IPC
 *  boundary on the adoption/discard paths. */
function isValidTmuxName(name: string): boolean {
  return /^clave-[A-Za-z0-9_-]+$/.test(name)
}

/** Plain records are keyed by the PTY session id (a UUID). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A record file's basename: the tmux name for tmux-backed sessions, the
 *  session id for plain ones. Everything that touches the filesystem or a
 *  kill-session call validates through this. */
function isValidRecordKey(key: string): boolean {
  return isValidTmuxName(key) || UUID_RE.test(key)
}

function recordKeyOf(meta: SessionRecord): string {
  return meta.tmuxName ?? meta.id
}

let recordsDirEnsured = false

export function sessionRecordsDir(): string {
  const dir = path.join(app.getPath('userData'), 'session-records')
  if (!recordsDirEnsured) {
    recordsDirEnsured = true
    // One-time move: records used to live in clave-tmux-sessions/ back when
    // only tmux-backed sessions had them.
    const legacy = path.join(app.getPath('userData'), 'clave-tmux-sessions')
    try {
      if (!fs.existsSync(dir) && fs.existsSync(legacy)) fs.renameSync(legacy, dir)
    } catch {
      // Fall through — worst case the legacy dir stays and records start fresh.
    }
  }
  return dir
}

/** Persist restore metadata. Returns false if it couldn't be written — the
 *  tmux path then falls back to a non-tmux spawn so we never create a tmux
 *  session we can't track (and would later be unable to adopt or clean up). */
function writeSessionRecord(meta: SessionRecord): boolean {
  const key = recordKeyOf(meta)
  if (!isValidRecordKey(key)) return false
  try {
    const dir = sessionRecordsDir()
    fs.mkdirSync(dir, { recursive: true })
    // Write-then-rename: records are rewritten on every rename, so a kill
    // mid-write must never be able to leave a truncated file behind — that
    // would lose the whole session, not just its name.
    const target = path.join(dir, `${key}.json`)
    const tmp = `${target}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(meta), 'utf-8')
    fs.renameSync(tmp, target)
    return true
  } catch {
    return false
  }
}

function readSessionRecord(key: string): SessionRecord | null {
  if (!isValidRecordKey(key)) return null
  try {
    return JSON.parse(
      fs.readFileSync(path.join(sessionRecordsDir(), `${key}.json`), 'utf-8')
    ) as SessionRecord
  } catch {
    return null
  }
}

function deleteSessionRecord(key: string): void {
  if (!isValidRecordKey(key)) return
  try {
    fs.unlinkSync(path.join(sessionRecordsDir(), `${key}.json`))
  } catch {
    // already gone
  }
}

/** The tmux config (`-f`) is read only when the server *first* starts. Clave's
 *  sessions outlive the app, so a server from before a config change keeps the
 *  old key bindings. For bindings we've *removed* from the config, omission
 *  can't unset them on a live server — reconcile them explicitly here. No-op
 *  when no server is running: the fresh server loads the current config via -f.
 *  (Starting a server here would race that load, so we only touch a live one.) */
function reconcileTmuxBindings(tmuxPath: string): void {
  if (liveTmuxSessions(tmuxPath).size === 0) return
  // Drop the legacy `MouseDown1Pane -> cancel` binding: the press fires before
  // the drag, so it snapped scrollback to the bottom on click and made
  // highlighting impossible. Without it, copy-mode's default drag-select works.
  for (const table of ['copy-mode', 'copy-mode-vi']) {
    try {
      execFileSync(tmuxPath, ['-L', TMUX_SOCKET, 'unbind', '-T', table, 'MouseDown1Pane'], {
        stdio: 'ignore'
      })
    } catch {
      // Best effort — the binding is already absent on a fresh-enough server.
    }
  }
}

/** List live tmux sessions on the clave socket (empty if tmux/socket absent). */
function liveTmuxSessions(tmuxPath: string): Set<string> {
  try {
    const out = execFileSync(
      tmuxPath,
      ['-L', TMUX_SOCKET, 'list-sessions', '-F', '#{session_name}'],
      { encoding: 'utf-8' }
    )
    return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))
  } catch {
    // No server running → no sessions.
    return new Set()
  }
}

export interface PtySpawnOptions {
  dangerousMode?: boolean
  /** Model the agent CLI starts on (alias like "opus" or a full model id).
   *  claude → `--model`, codex → `-m`; ignored for antigravity/terminal.
   *  Undefined = the CLI's own default. */
  model?: string
  claudeMode?: boolean
  antigravityMode?: boolean
  codexMode?: boolean
  claudeAgentsMode?: boolean
  resumeSessionId?: string
  claudeSessionId?: string
  initialCommand?: string
  autoExecute?: boolean
  /** Initial prompt handed to the agent CLI's interactive mode (claude/codex
   *  positional arg, agy -i). One-shot: not persisted to the tmux sidecar,
   *  so adoption re-spawns never re-submit it. */
  initialPrompt?: string
  /** Opt-in: run this session inside a persistent tmux session. */
  tmuxMode?: boolean
  /** Reattach to this exact existing tmux session instead of deriving a new
   *  name. Set when adopting a session that survived a previous app run. */
  adoptTmuxName?: string
  /** Reuse this exact PTY session id (instead of a fresh UUID) when adopting,
   *  so the Claude lifecycle-hook state file keeps matching the live agent. */
  adoptSessionId?: string
  /** CLAUDE_CONFIG_DIR for this session — selects the Claude account/profile.
   *  Empty/undefined leaves the env untouched (default passthrough). */
  configDir?: string
  /** Profile metadata persisted for restore + the session-header badge. */
  claudeProfileId?: string
  claudeProfileLabel?: string
  /** Workspace to stamp on the session record. The pty:spawn handler defaults
   *  it to the active workspace; explicit values win (pin launches, MCP). */
  workspaceId?: string
  /** The persisted key of the window asking (stamped by pty-handlers from the
   *  sender; adoption and re-homing re-stamp through the same path). */
  windowKey?: string
  /** What this session is the hidden half of, when it is one — persisted on
   *  the record so the next launch can put it back there. Omitted = a tab.
   *  Carried forward across adoption like the display name. */
  link?: SessionLink
}

/** Validate a link crossing the IPC boundary. It is only ever compared to
 *  renderer ids and echoed back, but it lands in a JSON file we re-read at
 *  boot, so the shape is pinned here rather than trusted. Unknown kinds and
 *  over-long ids are dropped, never coerced. */
function sanitizeSessionLink(link: unknown): SessionLink | undefined {
  if (!link || typeof link !== 'object') return undefined
  const l = link as Record<string, unknown>
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null
  if (l.kind === 'group-terminal') {
    const groupId = str(l.groupId)
    const terminalId = str(l.terminalId)
    return groupId && terminalId ? { kind: 'group-terminal', groupId, terminalId } : undefined
  }
  if (l.kind === 'session-view') {
    const ownerId = str(l.ownerId)
    return ownerId ? { kind: 'session-view', ownerId } : undefined
  }
  if (l.kind === 'toolbar') {
    const key = str(l.key)
    return key ? { kind: 'toolbar', key } : undefined
  }
  return undefined
}

interface PendingSpawn {
  file: string
  args: string[]
  cwd: string
  initialCommand?: string
  autoExecute?: boolean
  /** CLAUDE_CONFIG_DIR to set on the spawn env (account/profile selection). */
  configDir?: string
}

export interface PtySession {
  id: string
  cwd: string
  folderName: string
  ptyProcess: pty.IPty | null
  alive: boolean
  claudeSessionId?: string
  /** Set when this session is backed by a tmux session (the tmux session name). */
  tmuxName?: string
  pending?: PendingSpawn
  onData?: (data: string) => void
  onExit?: (exitCode: number) => void
}

class PtyManager {
  private sessions = new Map<string, PtySession>()

  /**
   * Plan a PTY spawn but defer the actual `pty.spawn()` until the renderer
   * has fit its xterm and reported real cols/rows. This avoids the TUI
   * (claude/agy) being born at the default 80×24 and then being mangled
   * by xterm's reflow when the renderer resizes to the real width.
   *
   * `start(id, cols, rows)` finalises the spawn at the correct size.
   */
  spawn(cwd: string, options?: PtySpawnOptions): PtySession {
    // Reuse the original id when adopting/relaunching a survivor, so the
    // Claude hook state file (baked with this id at first spawn) still routes
    // to this tab. Plain records relaunch with adoptSessionId alone.
    const id =
      options?.adoptSessionId && UUID_RE.test(options.adoptSessionId)
        ? options.adoptSessionId
        : randomUUID()
    const folderName = (isWindows ? cwd.split('\\') : cwd.split('/')).pop() || cwd
    const useAgentsMode = options?.claudeAgentsMode === true
    const useAntigravityMode = options?.antigravityMode === true
    const useCodexMode = options?.codexMode === true
    const useClaudeMode = options?.claudeMode !== false && !useAntigravityMode && !useCodexMode && !useAgentsMode

    // Like resume ids, the model is interpolated into the shell command string
    // (and round-trips through the tmux sidecar), so reject anything outside
    // the model-ref alphabet loudly rather than spawn a mangled command.
    const model = options?.model
    if (model !== undefined && !isValidModelName(model)) {
      throw new Error('Invalid model name')
    }

    let claudeSessionId: string | undefined
    let shellArgs: string[]
    if (isWindows) {
      // Windows: cmd.exe with /c to exec the command directly (no echoed prompt).
      if (useAntigravityMode) {
        shellArgs = ['/c', 'agy']
      } else if (useCodexMode) {
        shellArgs = model ? ['/c', 'codex', '-m', model] : ['/c', 'codex']
      } else if (useAgentsMode) {
        // `claude agents` is an interactive subcommand and does not accept
        // --session-id / --resume / --dangerously-skip-permissions, so spawn it bare.
        shellArgs = ['/c', 'claude', 'agents']
      } else if (!useClaudeMode) {
        shellArgs = []
      } else {
        const parts = ['claude']
        if (options?.resumeSessionId) {
          if (!isValidClaudeSessionId(options.resumeSessionId)) {
            throw new Error('Invalid resume session id')
          }
          parts.push('--resume', options.resumeSessionId)
          claudeSessionId = options.resumeSessionId
        } else {
          const requested = options?.claudeSessionId
          claudeSessionId = requested && isValidClaudeSessionId(requested) ? requested : randomUUID()
          parts.push('--session-id', claudeSessionId)
        }
        if (options?.dangerousMode) parts.push('--dangerously-skip-permissions')
        if (model) parts.push('--model', model)
        shellArgs = ['/c', ...parts]
      }
    } else {
      // POSIX: -l -c '<cmd>' runs the command non-interactively (no echo, no
      // prompt, no rc-file chatter like the macOS bash→zsh notice).
      if (useAntigravityMode) {
        shellArgs = [
          '-l',
          '-c',
          options?.initialPrompt
            ? `agy -i ${shellSingleQuote(options.initialPrompt)}`
            : 'agy'
        ]
      } else if (useCodexMode) {
        const codexParts = ['codex']
        if (model) codexParts.push('-m', shellSingleQuote(model))
        if (options?.initialPrompt) codexParts.push(shellSingleQuote(options.initialPrompt))
        shellArgs = ['-l', '-c', codexParts.join(' ')]
      } else if (useAgentsMode) {
        // `claude agents` is an interactive subcommand and does not accept
        // --session-id / --resume / --dangerously-skip-permissions, so spawn it bare.
        shellArgs = ['-l', '-c', 'claude agents']
      } else if (!useClaudeMode) {
        shellArgs = ['-l']
      } else {
        const parts = ['claude']
        if (options?.resumeSessionId) {
          // Interpolated into the `zsh -l -c` string below — reject ids carrying
          // shell metacharacters (e.g. from a poisoned sidecar) rather than run them.
          if (!isValidClaudeSessionId(options.resumeSessionId)) {
            throw new Error('Invalid resume session id')
          }
          parts.push('--resume', options.resumeSessionId)
          claudeSessionId = options.resumeSessionId
        } else {
          const requested = options?.claudeSessionId
          claudeSessionId = requested && isValidClaudeSessionId(requested) ? requested : randomUUID()
          parts.push('--session-id', claudeSessionId)
        }
        if (options?.dangerousMode) parts.push('--dangerously-skip-permissions')
        if (model) parts.push('--model', shellSingleQuote(model))
        // Wire lifecycle hooks → per-session state file for deterministic tab status.
        const settingsArg = buildClaudeHookSettingsArg(id)
        if (settingsArg) parts.push('--settings', settingsArg)
        // Wire the in-app MCP server so the agent can manipulate Clave (open
        // tabs, create groups). The config rides in a 0600 file rather than
        // inline JSON to keep the bearer token off ps/tmux-visible command lines.
        const mcpConfigPath = getMcpRuntime() ? writeSessionMcpConfig(id) : null
        if (mcpConfigPath) parts.push('--mcp-config', shellSingleQuote(mcpConfigPath))
        // Initial prompt goes LAST after a `--` separator. `--` ends the
        // variadic --mcp-config (so the prompt isn't read as another config
        // path) AND stops a prompt that begins with `-` from being parsed as a
        // flag. Verified: `claude <flags> --mcp-config F -- '<prompt>'`.
        if (options?.initialPrompt) parts.push('--', shellSingleQuote(options.initialPrompt))
        // CLAVE_SESSION_ID rides inside the command string, not the pty env: when
        // a tmux server already exists, new-session inherits the server's
        // environment, so only the command string reliably reaches claude.
        shellArgs = ['-l', '-c', `CLAVE_SESSION_ID=${shellSingleQuote(id)} ${parts.join(' ')}`]
      }
    }

    // By default we spawn the user's shell directly. When tmux mode is opted in
    // (and tmux is installed), we instead spawn a tmux client that runs the very
    // same shell command inside a persistent, named tmux session.
    const shellName = getUserShell()
    let spawnFile = shellName
    let spawnArgs = shellArgs
    let tmuxName: string | undefined

    // Adoption/relaunch rewrites the record from scratch, so carry the tab's
    // name and workspace forward — otherwise bringing a session back would
    // erase the very metadata we persisted for it.
    const previousKey =
      options?.adoptTmuxName && isValidTmuxName(options.adoptTmuxName)
        ? options.adoptTmuxName
        : options?.adoptSessionId && UUID_RE.test(options.adoptSessionId)
          ? options.adoptSessionId
          : null
    const previous = previousKey ? readSessionRecord(previousKey) : null

    const recordBase: SessionRecord = {
      id,
      claudeSessionId,
      cwd,
      folderName,
      displayName: previous?.displayName,
      userRenamed: previous?.userRenamed,
      claudeMode: useClaudeMode,
      antigravityMode: useAntigravityMode,
      codexMode: useCodexMode,
      claudeAgentsMode: useAgentsMode,
      dangerousMode: options?.dangerousMode === true,
      model,
      configDir: options?.configDir,
      claudeProfileId: options?.claudeProfileId,
      claudeProfileLabel: options?.claudeProfileLabel,
      workspaceId: previous?.workspaceId ?? options?.workspaceId,
      // The asking window is the home from now on — an adoption or a move
      // re-stamps; only a windowless spawn keeps what the record had.
      windowKey: options?.windowKey ?? previous?.windowKey,
      // What the session is the hidden half of. The caller wins (a re-spawn
      // may hang the same terminal off a different group), else what the
      // record already said, so an adoption never erases the ownership that
      // keeps the session out of the sidebar.
      link: sanitizeSessionLink(options?.link) ?? previous?.link
    }
    let recordKey: string | null = null

    const tmuxPath = options?.tmuxMode ? detectTmux() : null
    if (tmuxPath) {
      // When adopting a survivor, reattach to its exact (validated) name;
      // otherwise derive a fresh name that doesn't clash with any live session.
      const adopt = options?.adoptTmuxName
      const candidateName =
        adopt && isValidTmuxName(adopt) ? adopt : this.uniqueTmuxName(cwd, agentModeTag(options))

      // Persist restore metadata first. If we can't track the session, fall back
      // to a plain shell spawn rather than create an untrackable tmux session.
      const sidecarOk = writeSessionRecord({ ...recordBase, tmuxName: candidateName })

      if (sidecarOk) {
        recordKey = candidateName
        tmuxName = candidateName
        const confPath = getTmuxConfigPath()
        // A server predating this fix still carries the old click-to-cancel
        // binding; strip it from the live server so the fix applies without a
        // server restart (the -f config below only takes effect on a new one).
        reconcileTmuxBindings(tmuxPath)
        // `-u` forces UTF-8 client output. Electron apps are launched without a
        // UTF-8 locale (no LANG/LC_* in the GUI environment), so tmux would
        // otherwise run the client in non-UTF-8 mode and downsample every
        // multibyte glyph — box-drawing, the agent's logo, em-dashes — to `_`.
        // (Direct, non-tmux PTYs are unaffected: the agent + xterm.js are always
        // UTF-8; only tmux gates UTF-8 on the locale env.)
        const tmuxArgs: string[] = ['-u', '-L', TMUX_SOCKET]
        if (confPath) tmuxArgs.push('-f', confPath)
        // `new-session -A`: attach if the session already exists (reattach a live
        // agent after an app restart / from elsewhere), otherwise create it and
        // run the shell command. Attaching never re-runs the command. Fresh names
        // are guaranteed not to collide with a survivor, so `-A` only reattaches
        // on the explicit adoption path.
        tmuxArgs.push('new-session', '-A', '-s', tmuxName, shellName, ...shellArgs)
        spawnFile = tmuxPath
        spawnArgs = tmuxArgs
      }
    }

    // Plain session (tmux off or unavailable) — record it anyway, keyed by the
    // session id. The process can't outlive the app, but the record lets the
    // next launch offer to RELAUNCH the whole setup (fresh shell in the same
    // cwd; Claude resumes via claudeSessionId).
    if (!recordKey && writeSessionRecord(recordBase)) {
      recordKey = id
    }
    // A record can change keys across an adoption (plain→tmux when the global
    // toggle flipped, or tmux→plain after it was turned off) — drop the stale
    // file or the next launch would offer the same session twice.
    if (previousKey && previousKey !== recordKey) {
      deleteSessionRecord(previousKey)
    }

    const session: PtySession = {
      id,
      cwd,
      folderName,
      ptyProcess: null,
      alive: true,
      pending: {
        file: spawnFile,
        args: spawnArgs,
        cwd,
        initialCommand: options?.initialCommand,
        autoExecute: options?.autoExecute,
        configDir: options?.configDir
      }
    }
    if (claudeSessionId) session.claudeSessionId = claudeSessionId
    if (tmuxName) session.tmuxName = tmuxName
    this.sessions.set(id, session)
    return session
  }

  /** Pick a fresh tmux session name that clashes with neither an in-process
   *  session nor a live session on the tmux server. Checking the server too is
   *  essential: it stops a brand-new session from silently `-A`-attaching to a
   *  not-yet-adopted survivor of the same cwd+mode (which would hijack it). */
  private uniqueTmuxName(cwd: string, modeTag: string): string {
    const base = baseTmuxName(cwd, modeTag)
    const taken = new Set(
      Array.from(this.sessions.values())
        .map((s) => s.tmuxName)
        .filter((n): n is string => !!n)
    )
    const tmuxPath = detectTmux()
    if (tmuxPath) for (const n of liveTmuxSessions(tmuxPath)) taken.add(n)
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base}-${n}`)) n++
    return `${base}-${n}`
  }

  /**
   * Register the data/exit listeners that should be wired up as soon as the
   * underlying pty.spawn() runs. Must be called BEFORE start().
   */
  attachListeners(
    id: string,
    onData: (data: string) => void,
    onExit: (exitCode: number) => void
  ): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.onData = onData
    session.onExit = onExit
  }

  /**
   * Actually spawn the PTY at the renderer-measured cols/rows. Safe to call
   * once per session id; subsequent calls just resize.
   */
  start(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (session.ptyProcess) {
      // Already started — treat as resize.
      if (session.alive) session.ptyProcess.resize(cols, rows)
      return
    }
    if (!session.pending) return
    const { file, args, cwd, initialCommand, autoExecute, configDir } = session.pending
    session.pending = undefined

    const ptyName = isWindows ? undefined : 'xterm-256color'

    const ptyProcess = pty.spawn(file, args, {
      name: ptyName,
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      cwd,
      env: (() => {
        const env: Record<string, string> = {
          ...getLoginShellEnv(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        }
        delete env.CLAUDECODE
        // Per-session Claude account: point this session at an alternate config
        // dir. Only set when a non-default profile was chosen, so default
        // sessions keep honouring whatever the shell already exports.
        if (configDir) env.CLAUDE_CONFIG_DIR = configDir
        return env
      })()
    })

    session.ptyProcess = ptyProcess

    if (session.onData) {
      ptyProcess.onData(session.onData)
    }
    ptyProcess.onExit(({ exitCode }) => {
      session.alive = false
      session.onExit?.(exitCode)
    })

    // For plain-shell mode (no claude/agy), honour an explicit initialCommand.
    if (initialCommand) {
      setTimeout(() => {
        if (session.alive && session.ptyProcess) {
          session.ptyProcess.write(autoExecute === true ? initialCommand + '\r' : initialCommand)
        }
      }, INITIAL_COMMAND_DELAY_MS)
    }
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.ptyProcess?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (!session.ptyProcess) {
      // Not yet started — promote first resize into start().
      this.start(id, cols, rows)
      return
    }
    if (session.alive) {
      session.ptyProcess.resize(Math.max(1, cols), Math.max(1, rows))
    }
  }

  /**
   * Terminate a session.
   *
   * @param killTmuxSession when true (a user explicitly closing the session)
   *   the backing tmux session is destroyed for real. When false (the app is
   *   quitting) we only kill the local tmux *client*, which detaches and leaves
   *   the agent running in the tmux server to be reattached next launch.
   */
  kill(id: string, killTmuxSession = true): void {
    const session = this.sessions.get(id)
    if (session) {
      if (killTmuxSession) {
        // Real close: destroy the backing tmux session (if any) and the
        // session record — the tab is gone for good. On app quit we keep both
        // so the next launch can reattach (tmux) or offer a relaunch (plain).
        if (session.tmuxName) {
          const tmuxPath = detectTmux()
          if (tmuxPath) {
            execFile(
              tmuxPath,
              ['-L', TMUX_SOCKET, 'kill-session', '-t', session.tmuxName],
              () => {}
            )
          }
        }
        deleteSessionRecord(session.tmuxName ?? id)
      }
      // On a real close the session is gone for good; on app quit (tmux
      // survivor) the config must stay valid for the reattached agent.
      if (killTmuxSession) {
        deleteSessionMcpConfig(id)
        // Copy offers are surfaced in the tab's own header — once the tab is
        // gone they are unreachable, so don't keep their values in memory.
        dismissSessionOffers(id)
      }
      if (session.alive && session.ptyProcess) {
        session.ptyProcess.kill()
      }
      this.sessions.delete(id)
    }
  }

  /**
   * Record the tab's display name in the session's tmux sidecar so it survives
   * an app restart, a crash, or a reboot. Renames live in the renderer store,
   * which dies with the window — the sidecar is the only per-session record
   * that outlives it. Called on every rename (manual, auto-title, or reset to
   * the folder name); a no-op for sessions with no tmux sidecar to update.
   */
  /** The persisted record key for an in-memory session (tmux name or id). */
  private recordKeyForSession(id: string): string | null {
    const session = this.sessions.get(id)
    if (!session) return null
    return session.tmuxName ?? id
  }

  setSessionDisplayName(id: string, displayName: string | null, userRenamed: boolean): void {
    const key = this.recordKeyForSession(id)
    if (!key) return
    const meta = readSessionRecord(key)
    if (!meta) return
    const next = displayName?.trim() || undefined
    if (meta.displayName === next && !!meta.userRenamed === userRenamed) return
    writeSessionRecord({ ...meta, displayName: next, userRenamed })
  }

  /** Persist (or clear, with null) a session's attached web view in its
   *  record. Mirrors setSessionDisplayName — see SessionRecord.view. */
  setSessionViewRecord(id: string, view: { url: string; title?: string; command?: string; cwd?: string } | null): void {
    const key = this.recordKeyForSession(id)
    if (!key) return
    const meta = readSessionRecord(key)
    if (!meta) return
    writeSessionRecord({ ...meta, view: view ?? undefined })
  }

  /**
   * Re-stamp a session's workspace in its persisted record (workspace removal
   * reassigns sessions; a future "move to workspace" uses the same primitive).
   * Mirrors setSessionDisplayName: renderer state dies with the window, the
   * record is what survives.
   */
  setSessionWorkspace(id: string, workspaceId: string | null): void {
    const key = this.recordKeyForSession(id)
    if (!key) return
    const meta = readSessionRecord(key)
    if (!meta) return
    const next = workspaceId ?? undefined
    if (meta.workspaceId === next) return
    writeSessionRecord({ ...meta, workspaceId: next })
  }

  /** Follow a `/clear`: Claude Code rotated to a new transcript, so the
   *  session's id — in memory and in the record — moves with it. Mirrors
   *  setSessionDisplayName: what is not in the record does not survive a
   *  restart, and a stale id would resume the pre-/clear conversation. */
  setSessionClaudeSessionId(id: string, claudeSessionId: string): void {
    if (!isValidClaudeSessionId(claudeSessionId)) return
    const session = this.sessions.get(id)
    if (session) session.claudeSessionId = claudeSessionId
    const key = this.recordKeyForSession(id)
    if (!key) return
    const meta = readSessionRecord(key)
    if (!meta || meta.claudeSessionId === claudeSessionId) return
    writeSessionRecord({ ...meta, claudeSessionId })
  }

  /** Re-home a record to another window WITHOUT touching the process — used
   *  when a closing window hands a non-tmux session (whose pty dies with the
   *  window) to the primary, so the next boot offers it there. */
  setSessionWindowKey(id: string, windowKey: string): void {
    const key = this.recordKeyForSession(id)
    if (!key) return
    const meta = readSessionRecord(key)
    if (!meta || meta.windowKey === windowKey) return
    writeSessionRecord({ ...meta, windowKey })
  }

  /**
   * Reconcile session records with the live tmux server and return the
   * sessions that survived a previous run. Each is flagged `live`:
   *   - `live: true`  → the tmux session is still running (app quit/reopen, no
   *     reboot). The caller reattaches to the live process silently — the
   *     session was never disrupted.
   *   - `live: false` → the process is gone: a plain record (its PTY died with
   *     the app), or a tmux record whose server a shutdown/reboot killed. The
   *     caller RELAUNCHES it — fresh spawn in the same cwd, Claude resuming
   *     via claudeSessionId — behind the launch restore prompt.
   *
   * We deliberately do NOT kill live sessions that lack a record: the `clave`
   * socket is user-attachable (the settings panel advertises `tmux -L clave
   * attach`), so a name prefix isn't proof of ownership. Because every
   * Clave-created session is written a record before it is spawned, our own
   * sessions are always tracked. Records are pruned only when malformed or
   * when their cwd no longer exists (un-restorable) — so they can't
   * accumulate across reboots.
   */
  listAdoptableSessions(): SessionRecord[] {
    const tmuxPath = detectTmux()
    const live = tmuxPath ? liveTmuxSessions(tmuxPath) : new Set<string>()
    const adoptedTmuxNames = new Set(
      Array.from(this.sessions.values())
        .map((s) => s.tmuxName)
        .filter((n): n is string => !!n)
    )
    const adoptedIds = new Set(this.sessions.keys())

    const dir = sessionRecordsDir()
    let files: string[] = []
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    } catch {
      files = []
    }

    const adoptable: SessionRecord[] = []
    for (const file of files) {
      let meta: SessionRecord | null = null
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
      } catch {
        meta = null
      }
      if (meta && meta.antigravityMode === undefined) {
        // Legacy records (written before the Antigravity switch) carry the old
        // `antigravityMode`'s predecessor key. Map it forward so a survivor of the
        // retired Gemini CLI re-spawns as Antigravity (`agy`) on adoption.
        meta.antigravityMode = (meta as { geminiMode?: boolean }).geminiMode ?? false
      }
      // Malformed record → prune the file. Valid shapes: tmux-backed (valid
      // tmux name) or plain (no tmuxName, uuid session id).
      const validShape =
        meta &&
        (meta.tmuxName ? isValidTmuxName(meta.tmuxName) : !!meta.id && UUID_RE.test(meta.id))
      if (!meta || !validShape) {
        try {
          fs.unlinkSync(path.join(dir, file))
        } catch {
          /* ignore */
        }
        continue
      }
      const isLive = !!meta.tmuxName && live.has(meta.tmuxName)
      if (!isLive && !fs.existsSync(meta.cwd)) {
        // The working directory is gone — the session can't be relaunched, so
        // its record is dead weight. Prune it.
        deleteSessionRecord(recordKeyOf(meta))
        continue
      }
      const alreadyAdopted = meta.tmuxName ? adoptedTmuxNames.has(meta.tmuxName) : adoptedIds.has(meta.id)
      if (!alreadyAdopted) {
        adoptable.push({
          ...meta,
          // Legacy inference, implemented once: records written before the
          // workspace model (or spawned with none active) are placed by cwd —
          // under a registered root → that workspace; else left unstamped for
          // the renderer to assign to the active workspace.
          workspaceId: meta.workspaceId ?? workspaceManager.resolveWorkspaceForCwd(meta.cwd) ?? undefined,
          live: isLive
        })
      }
    }

    return adoptable
  }

  /** Destroy a surviving session the user chose not to bring back: kill the
   *  backing tmux session when there is one, then drop the record. */
  discardSessionRecord(key: string): void {
    if (!isValidRecordKey(key)) return
    if (isValidTmuxName(key)) {
      const tmuxPath = detectTmux()
      if (tmuxPath) {
        execFile(tmuxPath, ['-L', TMUX_SOCKET, 'kill-session', '-t', key], () => {})
      }
    }
    deleteSessionRecord(key)
  }

  getSession(id: string): PtySession | undefined {
    return this.sessions.get(id)
  }

  getAllSessions(): { id: string; cwd: string; folderName: string; alive: boolean }[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      cwd: s.cwd,
      folderName: s.folderName,
      alive: s.alive
    }))
  }

  /**
   * Kill every session. Used on app quit: tmux-backed sessions are only
   * detached (not destroyed) so the agents survive until the next launch.
   */
  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id, false)
    }
  }
}

// Re-export the default constants so existing imports remain valid.
export { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS }

export const ptyManager = new PtyManager()
