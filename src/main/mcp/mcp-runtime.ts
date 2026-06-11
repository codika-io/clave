import * as fs from 'fs'
import * as path from 'path'
import { randomBytes } from 'crypto'
import { app } from 'electron'

/** Runtime info about the in-app MCP server, set once it is listening. */
export interface McpRuntimeInfo {
  url: string
  token: string
}

let runtime: McpRuntimeInfo | null = null

export function setMcpRuntime(info: McpRuntimeInfo | null): void {
  runtime = info
}

export function getMcpRuntime(): McpRuntimeInfo | null {
  return runtime
}

function serverStateFilePath(): string {
  return path.join(app.getPath('userData'), 'mcp-server.json')
}

function sessionConfigDir(): string {
  return path.join(app.getPath('userData'), 'mcp-configs')
}

function sessionConfigPath(claveSessionId: string): string {
  return path.join(sessionConfigDir(), `${claveSessionId}.json`)
}

/**
 * Load the persisted MCP server state (port + token), or mint a fresh token.
 * Token and port are persisted because tmux-backed Claude sessions survive app
 * restarts without re-running `claude` — their injected MCP config must keep
 * working, so the server tries to come back on the same port with the same
 * token. Port 0 means "pick an ephemeral port".
 */
export function loadOrCreateServerState(): { port: number; token: string } {
  try {
    const data = JSON.parse(fs.readFileSync(serverStateFilePath(), 'utf-8')) as {
      url?: string
      token?: string
    }
    const port = Number(new URL(data.url ?? '').port)
    if (data.token && Number.isInteger(port) && port > 0) {
      return { port, token: data.token }
    }
  } catch {
    /* fall through to fresh state */
  }
  return { port: 0, token: randomBytes(32).toString('hex') }
}

/** Persist the server endpoint. Doubles as a discovery file for external agents. */
export function saveServerState(url: string, token: string): void {
  const filePath = serverStateFilePath()
  const tmp = `${filePath}.tmp`
  // Write-then-rename so a kill mid-write can never leave a truncated file.
  fs.writeFileSync(tmp, JSON.stringify({ url, token }, null, 2), { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tmp, filePath)
  fs.chmodSync(filePath, 0o600)
}

/**
 * Write the per-session `--mcp-config` file for a Claude session spawned by
 * Clave. The X-Clave-Session-Id header lets the server resolve "my group" for
 * the calling tab. A file (rather than inline JSON) keeps the bearer token off
 * `ps`/tmux-visible command lines. Returns the file path, or null on failure
 * (the spawn then simply omits the flag).
 */
export function writeSessionMcpConfig(claveSessionId: string): string | null {
  if (!runtime) return null
  try {
    const dir = sessionConfigDir()
    fs.mkdirSync(dir, { recursive: true })
    const config = {
      mcpServers: {
        clave: {
          type: 'http',
          url: runtime.url,
          headers: {
            Authorization: `Bearer ${runtime.token}`,
            'X-Clave-Session-Id': claveSessionId
          }
        }
      }
    }
    const filePath = sessionConfigPath(claveSessionId)
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600
    })
    fs.chmodSync(filePath, 0o600)
    return filePath
  } catch (err) {
    console.error('[mcp] failed to write session config', err)
    return null
  }
}

export function deleteSessionMcpConfig(claveSessionId: string): void {
  try {
    fs.unlinkSync(sessionConfigPath(claveSessionId))
  } catch {
    /* already gone */
  }
}

/**
 * Remove per-session config files whose session no longer exists. A session
 * can outlive an app run only via its tmux sidecar, so any config whose id has
 * no sidecar is stale. Call once on startup.
 */
export function sweepSessionMcpConfigs(): void {
  let configFiles: string[]
  try {
    configFiles = fs.readdirSync(sessionConfigDir()).filter((f) => f.endsWith('.json'))
  } catch {
    return
  }
  const liveIds = new Set<string>()
  try {
    const sidecarDir = path.join(app.getPath('userData'), 'clave-tmux-sessions')
    for (const file of fs.readdirSync(sidecarDir)) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(sidecarDir, file), 'utf-8')) as {
          id?: string
        }
        if (meta.id) liveIds.add(meta.id)
      } catch {
        /* malformed sidecar — pty-manager prunes these */
      }
    }
  } catch {
    /* no sidecar dir — every config is stale */
  }
  for (const file of configFiles) {
    if (!liveIds.has(path.basename(file, '.json'))) {
      try {
        fs.unlinkSync(path.join(sessionConfigDir(), file))
      } catch {
        /* ignore */
      }
    }
  }
}
