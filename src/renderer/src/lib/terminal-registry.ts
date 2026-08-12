import type { Terminal } from '@xterm/xterm'

/**
 * Live xterm instances by session id. TerminalGrid keeps every local tab's
 * terminal mounted (hidden ones get display:none), so this registry gives
 * non-component code — the MCP dispatcher's clave_read_session — access to
 * any tab's rendered buffer without threading refs through the tree.
 */
const terminals = new Map<string, Terminal>()

export function registerTerminal(sessionId: string, terminal: Terminal): void {
  terminals.set(sessionId, terminal)
}

export function unregisterTerminal(sessionId: string, terminal: Terminal): void {
  // Only remove our own entry: StrictMode-style remount overlap must not let
  // an old instance's cleanup delete the new instance's registration.
  if (terminals.get(sessionId) === terminal) terminals.delete(sessionId)
}

export function getRegisteredTerminal(sessionId: string): Terminal | undefined {
  return terminals.get(sessionId)
}
