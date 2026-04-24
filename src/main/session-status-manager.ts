import { app, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Per-session runtime state reported by Claude Code via its documented
 * statusLine hook. Fields map 1:1 to CC's status payload; all optional
 * because CC only emits fields relevant to the active model/mode.
 */
export interface SessionStatus {
  model?: { id: string; display_name?: string }
  effort?: { level: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }
  thinking?: { enabled: boolean }
  context_window?: {
    total_input_tokens?: number
    total_output_tokens?: number
    context_window_size: number
    current_usage: number | null
    used_percentage: number | null
    remaining_percentage?: number | null
  }
  exceeds_200k_tokens?: boolean
  fast_mode?: boolean
  cost?: {
    total_cost_usd?: number
    total_duration_ms?: number
    total_api_duration_ms?: number
    total_lines_added?: number
    total_lines_removed?: number
  }
  agent?: { name?: string }
  output_style?: { name?: string }
}

const DEBOUNCE_MS = 100

// Registered (claudeSessionId → Clave session id) so we can route status
// updates back to the right renderer session.
const claudeIdToSessionId = new Map<string, string>()
const debounceTimers = new Map<string, NodeJS.Timeout>()
let statusDir: string | null = null
let settingsDir: string | null = null
let watcher: fs.FSWatcher | null = null

function ensureDirs(): { statusDir: string; settingsDir: string } {
  if (statusDir && settingsDir) return { statusDir, settingsDir }
  const base = path.join(app.getPath('userData'), 'cc-status')
  fs.mkdirSync(base, { recursive: true })
  const tmp = path.join(os.tmpdir(), 'clave-cc-settings')
  fs.mkdirSync(tmp, { recursive: true })
  statusDir = base
  settingsDir = tmp
  return { statusDir, settingsDir }
}

function hookScriptPath(): string {
  // In dev and packaged builds, resources/ ships under resources/ (asarUnpacked).
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'clave-statusline-hook.sh')
  }
  return path.join(app.getAppPath(), 'resources', 'clave-statusline-hook.sh')
}

function readStatus(claudeSessionId: string): SessionStatus | null {
  if (!statusDir) return null
  try {
    const raw = fs.readFileSync(path.join(statusDir, `${claudeSessionId}.json`), 'utf8')
    return JSON.parse(raw) as SessionStatus
  } catch {
    return null
  }
}

function handleFileChange(filename: string): void {
  if (!filename.endsWith('.json') || filename.startsWith('.')) return
  const claudeSessionId = filename.slice(0, -'.json'.length)
  const sessionId = claudeIdToSessionId.get(claudeSessionId)
  if (!sessionId) return

  // Debounce rapid writes (CC can emit several status refreshes back-to-back).
  const existing = debounceTimers.get(claudeSessionId)
  if (existing) clearTimeout(existing)
  debounceTimers.set(
    claudeSessionId,
    setTimeout(() => {
      debounceTimers.delete(claudeSessionId)
      const status = readStatus(claudeSessionId)
      if (!status) return
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(`cc-status:update:${sessionId}`, status)
        }
      }
    }, DEBOUNCE_MS)
  )
}

/**
 * Start watching the status directory. Safe to call multiple times.
 */
export function initSessionStatusManager(): void {
  const { statusDir: dir } = ensureDirs()
  if (watcher) return
  try {
    watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
      if (filename) handleFileChange(filename)
    })
  } catch (err) {
    console.error('[session-status] failed to watch', dir, err)
  }
}

/**
 * Prepare a per-session settings file that injects our statusLine hook.
 * Returns the settings file path to pass to `claude --settings <path>`,
 * or null if setup failed (caller should spawn without the flag).
 */
export function prepareSessionSettings(claudeSessionId: string, claveSessionId: string): string | null {
  try {
    const { settingsDir: sdir, statusDir: outDir } = ensureDirs()
    const hook = hookScriptPath()
    if (!fs.existsSync(hook)) {
      console.warn('[session-status] hook script missing:', hook)
      return null
    }
    const settings = {
      statusLine: {
        type: 'command',
        command: `${shellQuote(hook)} ${shellQuote(claudeSessionId)} ${shellQuote(outDir)}`
      }
    }
    const settingsPath = path.join(sdir, `${claudeSessionId}.json`)
    fs.writeFileSync(settingsPath, JSON.stringify(settings), { mode: 0o600 })
    claudeIdToSessionId.set(claudeSessionId, claveSessionId)
    return settingsPath
  } catch (err) {
    console.error('[session-status] prepareSessionSettings failed:', err)
    return null
  }
}

/**
 * Clean up per-session settings file + status file when the session ends.
 */
export function disposeSession(claudeSessionId: string | null | undefined): void {
  if (!claudeSessionId) return
  claudeIdToSessionId.delete(claudeSessionId)
  const timer = debounceTimers.get(claudeSessionId)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(claudeSessionId)
  }
  if (settingsDir) {
    fs.rm(path.join(settingsDir, `${claudeSessionId}.json`), { force: true }, () => {})
  }
  if (statusDir) {
    fs.rm(path.join(statusDir, `${claudeSessionId}.json`), { force: true }, () => {})
  }
}

// Single-quote-wrap a value for /bin/sh, escaping embedded single quotes.
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
