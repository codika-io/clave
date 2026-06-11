import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getMainWindow } from '../window-utils'

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

/**
 * Send a command to the renderer's MCP dispatcher and await its reply. The
 * sidebar state (groups, tabs) lives in the renderer's Zustand store, so every
 * MCP tool call is executed there and the result travels back over
 * `mcp:response`.
 */
export function callRenderer<T>(command: string, payload: unknown, timeoutMs = 10_000): Promise<T> {
  const win = getMainWindow()
  if (!win) {
    return Promise.reject(new Error('Clave window not available'))
  }
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
