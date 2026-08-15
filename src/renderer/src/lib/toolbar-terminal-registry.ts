/** Live persistent toolbar-terminal sessions, keyed by `${pinId}:${terminalIndex}`.
 *
 *  These PTYs (dev servers behind toolbar server buttons) are spawned outside
 *  the session store, so the only handle on them used to be component state in
 *  ToolbarTerminalPopover — and workspace switching UNMOUNTS those buttons,
 *  which would orphan a running server and spawn a duplicate on the next
 *  click. This module owns the handle for the session's whole lifetime; the
 *  popover just reads it on mount.
 */
const registry = new Map<string, string>()

export function adoptPersistentToolbarSession(key: string, sessionId: string): void {
  registry.set(key, sessionId)
  // The exit listener lives at module level, NOT in the component: a session
  // dying while its workspace is hidden must still clear the entry, or
  // switching back would "reattach" to a corpse.
  const cleanup = window.electronAPI.onSessionExit(sessionId, () => {
    if (registry.get(key) === sessionId) registry.delete(key)
    cleanup()
  })
}

export function getPersistentToolbarSession(key: string): string | null {
  return registry.get(key) ?? null
}
