export function shellEscape(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`
}

export function insertPath(sessionId: string, filePath: string): void {
  window.electronAPI.writeSession(sessionId, shellEscape(filePath))
}
