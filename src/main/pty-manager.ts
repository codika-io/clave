import * as pty from 'node-pty'
import { execFile, execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS, INITIAL_COMMAND_DELAY_MS } from './constants'
import { stateFilePath } from './agent-state-manager'

const isWindows = process.platform === 'win32'

/** Wrap a string as a single shell-quoted token (safe for embedding in `zsh -c`). */
function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
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
  const q = JSON.stringify(stateFilePath(claveSessionId)) // double-quoted shell token for the path
  const write = (word: string): { hooks: { type: 'command'; command: string }[] } => ({
    hooks: [{ type: 'command', command: `printf ${word} > ${q}` }]
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
              command: `grep -qiE "permission|elicitation" && printf blocked > ${q} || true`
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

function getUserShell(): string {
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
    'set -g mouse on',
    'set -g history-limit 50000',
    'set -sg escape-time 10',
    'set -g focus-events on',
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
  if (options?.geminiMode) return 'gemini'
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

/** What the renderer needs to recreate + reattach a surviving session's tab. */
export interface AdoptableTmuxSession {
  tmuxName: string
  /** Original PTY session id, reused on adoption so the Claude lifecycle-hook
   *  state file (keyed by this id) keeps matching after reattach. */
  id: string
  claudeSessionId?: string
  cwd: string
  folderName: string
  claudeMode: boolean
  geminiMode: boolean
  codexMode: boolean
  claudeAgentsMode: boolean
  dangerousMode: boolean
}

/** tmux session names we create are always `clave-<sanitized>`. Validate before
 *  using a name in a filesystem path or a kill-session call — it crosses the IPC
 *  boundary on the adoption/discard paths. */
function isValidTmuxName(name: string): boolean {
  return /^clave-[A-Za-z0-9_-]+$/.test(name)
}

function tmuxSidecarDir(): string {
  return path.join(app.getPath('userData'), 'clave-tmux-sessions')
}

/** Persist restore metadata. Returns false if it couldn't be written, in which
 *  case the caller falls back to a non-tmux spawn so we never create a tmux
 *  session we can't track (and would later be unable to adopt or clean up). */
function writeTmuxSidecar(meta: AdoptableTmuxSession): boolean {
  if (!isValidTmuxName(meta.tmuxName)) return false
  try {
    const dir = tmuxSidecarDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${meta.tmuxName}.json`), JSON.stringify(meta), 'utf-8')
    return true
  } catch {
    return false
  }
}

function deleteTmuxSidecar(tmuxName: string): void {
  if (!isValidTmuxName(tmuxName)) return
  try {
    fs.unlinkSync(path.join(tmuxSidecarDir(), `${tmuxName}.json`))
  } catch {
    // already gone
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
  claudeMode?: boolean
  geminiMode?: boolean
  codexMode?: boolean
  claudeAgentsMode?: boolean
  resumeSessionId?: string
  claudeSessionId?: string
  initialCommand?: string
  autoExecute?: boolean
  /** Opt-in: run this session inside a persistent tmux session. */
  tmuxMode?: boolean
  /** Reattach to this exact existing tmux session instead of deriving a new
   *  name. Set when adopting a session that survived a previous app run. */
  adoptTmuxName?: string
  /** Reuse this exact PTY session id (instead of a fresh UUID) when adopting,
   *  so the Claude lifecycle-hook state file keeps matching the live agent. */
  adoptSessionId?: string
}

interface PendingSpawn {
  file: string
  args: string[]
  cwd: string
  initialCommand?: string
  autoExecute?: boolean
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
   * (claude/gemini) being born at the default 80×24 and then being mangled
   * by xterm's reflow when the renderer resizes to the real width.
   *
   * `start(id, cols, rows)` finalises the spawn at the correct size.
   */
  spawn(cwd: string, options?: PtySpawnOptions): PtySession {
    // Reuse the original id when adopting a survivor, so the Claude hook state
    // file (baked with this id at first spawn) still routes to this tab.
    const id =
      options?.adoptSessionId && options?.adoptTmuxName ? options.adoptSessionId : randomUUID()
    const folderName = (isWindows ? cwd.split('\\') : cwd.split('/')).pop() || cwd
    const useAgentsMode = options?.claudeAgentsMode === true
    const useGeminiMode = options?.geminiMode === true
    const useCodexMode = options?.codexMode === true
    const useClaudeMode = options?.claudeMode !== false && !useGeminiMode && !useCodexMode && !useAgentsMode

    let claudeSessionId: string | undefined
    let shellArgs: string[]
    if (isWindows) {
      // Windows: cmd.exe with /c to exec the command directly (no echoed prompt).
      if (useGeminiMode) {
        shellArgs = ['/c', 'gemini']
      } else if (useCodexMode) {
        shellArgs = ['/c', 'codex']
      } else if (useAgentsMode) {
        // `claude agents` is an interactive subcommand and does not accept
        // --session-id / --resume / --dangerously-skip-permissions, so spawn it bare.
        shellArgs = ['/c', 'claude', 'agents']
      } else if (!useClaudeMode) {
        shellArgs = []
      } else {
        const parts = ['claude']
        if (options?.resumeSessionId) {
          parts.push('--resume', options.resumeSessionId)
          claudeSessionId = options.resumeSessionId
        } else {
          claudeSessionId = options?.claudeSessionId ?? randomUUID()
          parts.push('--session-id', claudeSessionId)
        }
        if (options?.dangerousMode) parts.push('--dangerously-skip-permissions')
        shellArgs = ['/c', ...parts]
      }
    } else {
      // POSIX: -l -c '<cmd>' runs the command non-interactively (no echo, no
      // prompt, no rc-file chatter like the macOS bash→zsh notice).
      if (useGeminiMode) {
        shellArgs = ['-l', '-c', 'gemini']
      } else if (useCodexMode) {
        shellArgs = ['-l', '-c', 'codex']
      } else if (useAgentsMode) {
        // `claude agents` is an interactive subcommand and does not accept
        // --session-id / --resume / --dangerously-skip-permissions, so spawn it bare.
        shellArgs = ['-l', '-c', 'claude agents']
      } else if (!useClaudeMode) {
        shellArgs = ['-l']
      } else {
        const parts = ['claude']
        if (options?.resumeSessionId) {
          parts.push('--resume', options.resumeSessionId)
          claudeSessionId = options.resumeSessionId
        } else {
          claudeSessionId = options?.claudeSessionId ?? randomUUID()
          parts.push('--session-id', claudeSessionId)
        }
        if (options?.dangerousMode) parts.push('--dangerously-skip-permissions')
        // Wire lifecycle hooks → per-session state file for deterministic tab status.
        const settingsArg = buildClaudeHookSettingsArg(id)
        if (settingsArg) parts.push('--settings', settingsArg)
        shellArgs = ['-l', '-c', parts.join(' ')]
      }
    }

    // By default we spawn the user's shell directly. When tmux mode is opted in
    // (and tmux is installed), we instead spawn a tmux client that runs the very
    // same shell command inside a persistent, named tmux session.
    const shellName = getUserShell()
    let spawnFile = shellName
    let spawnArgs = shellArgs
    let tmuxName: string | undefined

    const tmuxPath = options?.tmuxMode ? detectTmux() : null
    if (tmuxPath) {
      // When adopting a survivor, reattach to its exact (validated) name;
      // otherwise derive a fresh name that doesn't clash with any live session.
      const adopt = options?.adoptTmuxName
      const candidateName =
        adopt && isValidTmuxName(adopt) ? adopt : this.uniqueTmuxName(cwd, agentModeTag(options))

      // Persist restore metadata first. If we can't track the session, fall back
      // to a plain shell spawn rather than create an untrackable tmux session.
      const sidecarOk = writeTmuxSidecar({
        tmuxName: candidateName,
        id,
        claudeSessionId,
        cwd,
        folderName,
        claudeMode: useClaudeMode,
        geminiMode: useGeminiMode,
        codexMode: useCodexMode,
        claudeAgentsMode: useAgentsMode,
        dangerousMode: options?.dangerousMode === true
      })

      if (sidecarOk) {
        tmuxName = candidateName
        const confPath = getTmuxConfigPath()
        const tmuxArgs: string[] = ['-L', TMUX_SOCKET]
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
        autoExecute: options?.autoExecute
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
    const { file, args, cwd, initialCommand, autoExecute } = session.pending
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

    // For plain-shell mode (no claude/gemini), honour an explicit initialCommand.
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
      if (session.tmuxName && killTmuxSession) {
        const tmuxPath = detectTmux()
        if (tmuxPath) {
          execFile(
            tmuxPath,
            ['-L', TMUX_SOCKET, 'kill-session', '-t', session.tmuxName],
            () => {}
          )
        }
        deleteTmuxSidecar(session.tmuxName)
      }
      if (session.alive && session.ptyProcess) {
        session.ptyProcess.kill()
      }
      this.sessions.delete(id)
    }
  }

  /**
   * Reconcile sidecars with the live tmux server and return the sessions that
   * survived a previous run and should be re-adopted as tabs. Sidecars whose
   * tmux session is gone are pruned. We deliberately do NOT kill live sessions
   * that lack a sidecar: the `clave` socket is user-attachable (the settings
   * panel advertises `tmux -L clave attach`), so a name prefix isn't proof of
   * ownership. Because every Clave-created session is written a sidecar before
   * it is spawned (and falls back to a non-tmux spawn if that write fails), our
   * own sessions are always tracked and adopted — they can't accumulate.
   */
  listAdoptableTmuxSessions(): AdoptableTmuxSession[] {
    const tmuxPath = detectTmux()
    if (!tmuxPath) return []

    const live = liveTmuxSessions(tmuxPath)
    const alreadyAdopted = new Set(
      Array.from(this.sessions.values())
        .map((s) => s.tmuxName)
        .filter((n): n is string => !!n)
    )

    const dir = tmuxSidecarDir()
    let files: string[] = []
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    } catch {
      files = []
    }

    const adoptable: AdoptableTmuxSession[] = []
    for (const file of files) {
      let meta: AdoptableTmuxSession | null = null
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
      } catch {
        meta = null
      }
      if (!meta?.tmuxName || !isValidTmuxName(meta.tmuxName)) {
        try {
          fs.unlinkSync(path.join(dir, file))
        } catch {
          /* ignore */
        }
        continue
      }
      if (!live.has(meta.tmuxName)) {
        // Session is gone — its sidecar is stale.
        deleteTmuxSidecar(meta.tmuxName)
      } else if (!alreadyAdopted.has(meta.tmuxName)) {
        adoptable.push(meta)
      }
    }

    return adoptable
  }

  /** Destroy a surviving tmux session the user chose not to adopt. */
  discardTmuxSession(tmuxName: string): void {
    if (!isValidTmuxName(tmuxName)) return
    const tmuxPath = detectTmux()
    if (tmuxPath) {
      execFile(tmuxPath, ['-L', TMUX_SOCKET, 'kill-session', '-t', tmuxName], () => {})
    }
    deleteTmuxSidecar(tmuxName)
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
