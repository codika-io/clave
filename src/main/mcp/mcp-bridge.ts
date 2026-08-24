import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { windowRegistry } from '../window-registry'
import { focusedOrPrimaryWindow } from '../window-routing'

/** A renderer reply to an `mcp:command` request. */
interface McpBridgeResponse {
  requestId: string
  ok: boolean
  result?: unknown
  error?: string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

const pending = new Map<string, PendingRequest>()

function dispatch<T>(
  win: BrowserWindow,
  command: string,
  payload: unknown,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const requestId = randomUUID()
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error(`Clave did not respond to "${command}" within ${timeoutMs}ms`))
    }, timeoutMs)
    pending.set(requestId, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer
    })
    win.webContents.send('mcp:command', { requestId, command, payload })
  })
}

/**
 * Send a command to ONE window's renderer dispatcher and await its reply. The
 * sidebar state (groups, tabs) lives in each renderer's Zustand store, and
 * with multiple windows that state is PARTITIONED by hosting — so the caller
 * (mcp-server) resolves which window should execute the command and passes it
 * here. When no window is given, the focused window (else the primary) runs
 * it: the single-window-equivalent fallback for a windowless MCP client.
 */
export function callRenderer<T>(
  command: string,
  payload: unknown,
  win?: BrowserWindow | null,
  timeoutMs = 10_000
): Promise<T> {
  const target = win && !win.isDestroyed() ? win : focusedOrPrimaryWindow()
  if (!target) {
    return Promise.reject(new Error('Clave window not available'))
  }
  return dispatch<T>(target, command, payload, timeoutMs)
}

/**
 * Dispatch a command to EVERY window and collect all replies. Used to
 * aggregate across the partitioned stores (`clave_list` scope all) and to
 * resolve a session reference to the one window whose store holds it. A window
 * that errors or times out is reported, never fatal to the others.
 */
export async function callRendererAll<T>(
  command: string,
  payload: unknown,
  timeoutMs = 10_000
): Promise<{ windowId: number; ok: boolean; result?: T; error?: string }[]> {
  const windows = windowRegistry.listWindows()
  return Promise.all(
    windows.map(async (win) => {
      try {
        const result = await dispatch<T>(win, command, payload, timeoutMs)
        return { windowId: win.id, ok: true, result }
      } catch (err) {
        return {
          windowId: win.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        }
      }
    })
  )
}

/** Register the `mcp:response` listener. Call once at startup. */
export function registerMcpBridge(): void {
  ipcMain.on('mcp:response', (_event, response: McpBridgeResponse) => {
    const entry = pending.get(response.requestId)
    if (!entry) return // late reply after timeout — ignore
    pending.delete(response.requestId)
    clearTimeout(entry.timer)
    if (response.ok) {
      entry.resolve(response.result)
    } else {
      entry.reject(new Error(response.error || 'Unknown error in Clave renderer'))
    }
  })
}
