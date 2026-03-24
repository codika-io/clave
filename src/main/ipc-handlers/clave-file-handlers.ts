import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/** Active .clave file watchers keyed by absolute file path */
const claveWatchers = new Map<string, { watcher: fs.FSWatcher; cleanup: () => void }>()

/** Suppress file-changed events briefly after we write (to avoid echo) */
const recentWrites = new Set<string>()

interface ClaveGroupData {
  name: string
  cwd: string
  color: string | null
  toolbar?: boolean
  sessions: { cwd: string; name: string; claudeMode: boolean; dangerousMode: boolean }[]
  terminals: { command: string; commandMode: 'prefill' | 'auto'; color: string; icon?: string }[]
}

interface ClaveFileRaw {
  $schema?: string
  // Single-group format
  name?: string
  cwd?: string
  color?: string | null
  sessions?: ClaveGroupData['sessions']
  terminals?: ClaveGroupData['terminals']
  toolbar?: boolean
  // Multi-group format
  groups?: Array<{
    name: string
    cwd?: string
    color?: string | null
    toolbar?: boolean
    sessions?: ClaveGroupData['sessions']
    terminals?: ClaveGroupData['terminals']
  }>
}

type ClaveFileReadResult =
  | ({ type: 'single' } & ClaveGroupData)
  | { type: 'multi'; groups: ClaveGroupData[] }

interface ClaveFileWriteData {
  name?: string
  cwd?: string | null
  color?: string | null
  sessions?: ClaveGroupData['sessions']
  terminals?: ClaveGroupData['terminals']
  groups?: Array<{
    name: string
    cwd: string | null
    color: string | null
    sessions: ClaveGroupData['sessions']
    terminals: ClaveGroupData['terminals']
  }>
}

function resolveGroup(raw: { name?: string; cwd?: string; color?: string | null; toolbar?: boolean; sessions?: ClaveGroupData['sessions']; terminals?: ClaveGroupData['terminals'] }, dir: string, fallbackName: string): ClaveGroupData {
  return {
    name: raw.name || fallbackName,
    cwd: path.resolve(dir, raw.cwd || '.'),
    color: raw.color ?? null,
    toolbar: raw.toolbar ?? undefined,
    sessions: (raw.sessions || []).map((s) => ({
      cwd: path.resolve(dir, s.cwd || '.'),
      name: s.name,
      claudeMode: s.claudeMode ?? false,
      dangerousMode: s.dangerousMode ?? false
    })),
    terminals: (raw.terminals || []).map((t) => ({
      command: t.command || '',
      commandMode: t.commandMode || 'prefill',
      color: t.color || 'blue',
      icon: t.icon
    }))
  }
}

export function registerClaveFileHandlers(): void {
  // Read a .clave file and resolve relative paths to absolute
  ipcMain.handle(
    'clave:read-file',
    async (_event, absolutePath: string): Promise<ClaveFileReadResult | null> => {
      try {
        const raw = fs.readFileSync(absolutePath, 'utf-8')
        const data: ClaveFileRaw = JSON.parse(raw)
        const dir = path.dirname(absolutePath)
        const fallbackName = path.basename(absolutePath, '.clave')

        // Multi-group format
        if (Array.isArray(data.groups)) {
          return {
            type: 'multi',
            groups: data.groups.map((g, i) => resolveGroup(g, dir, `Group ${i + 1}`))
          }
        }

        // Single-group format
        return {
          type: 'single',
          ...resolveGroup(data, dir, fallbackName)
        }
      } catch (err) {
        console.error('[clave] Failed to read .clave file:', absolutePath, err)
        return null
      }
    }
  )

  // Write a .clave file, converting absolute paths to relative
  ipcMain.handle(
    'clave:write-file',
    async (_event, absolutePath: string, pinned: ClaveFileWriteData): Promise<void> => {
      try {
        const dir = path.dirname(absolutePath)

        const toRelative = (abs: string | null): string => {
          if (!abs) return '.'
          const rel = path.relative(dir, abs)
          return rel === '' ? '.' : rel
        }

        const serializeGroup = (g: { name: string; cwd: string | null; color: string | null; toolbar?: boolean; sessions: ClaveGroupData['sessions']; terminals: ClaveGroupData['terminals'] }) => ({
          name: g.name,
          cwd: toRelative(g.cwd),
          color: g.color,
          ...(g.toolbar ? { toolbar: true } : {}),
          sessions: g.sessions.map((s) => ({
            cwd: toRelative(s.cwd),
            name: s.name,
            claudeMode: s.claudeMode,
            dangerousMode: s.dangerousMode
          })),
          terminals: g.terminals.map((t) => ({
            command: t.command,
            commandMode: t.commandMode,
            color: t.color,
            ...(t.icon ? { icon: t.icon } : {})
          }))
        })

        let output: object

        // Multi-group format
        if (pinned.groups) {
          output = {
            $schema: 'clave/1.0',
            groups: pinned.groups.map(serializeGroup)
          }
        } else {
          // Single-group format
          output = {
            $schema: 'clave/1.0',
            ...serializeGroup({
              name: pinned.name || '',
              cwd: pinned.cwd || null,
              color: pinned.color || null,
              sessions: pinned.sessions || [],
              terminals: pinned.terminals || []
            })
          }
        }

        // Suppress the watcher echo for this file
        recentWrites.add(absolutePath)
        setTimeout(() => recentWrites.delete(absolutePath), 1000)

        fs.writeFileSync(absolutePath, JSON.stringify(output, null, 2) + '\n', 'utf-8')
      } catch (err) {
        console.error('[clave] Failed to write .clave file:', absolutePath, err)
      }
    }
  )

  // Check if a file exists
  ipcMain.handle('clave:file-exists', (_event, absolutePath: string): boolean => {
    try {
      return fs.existsSync(absolutePath)
    } catch {
      return false
    }
  })

  // Watch a .clave file for external changes
  ipcMain.handle('clave:watch-file', (_event, absolutePath: string) => {
    if (claveWatchers.has(absolutePath)) return

    const win = BrowserWindow.fromWebContents(_event.sender)
    if (!win) return

    try {
      let debounceTimer: NodeJS.Timeout | null = null

      const watcher = fs.watch(absolutePath, (_eventType) => {
        if (recentWrites.has(absolutePath)) return

        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('clave:file-changed', absolutePath)
          }
        }, 500)
      })

      const cleanup = (): void => {
        if (debounceTimer) clearTimeout(debounceTimer)
        watcher.close()
        claveWatchers.delete(absolutePath)
      }

      watcher.on('error', cleanup)
      claveWatchers.set(absolutePath, { watcher, cleanup })
    } catch (err) {
      console.warn('[clave] Watch failed for:', absolutePath, (err as Error).message)
    }
  })

  // Stop watching a .clave file
  ipcMain.handle('clave:unwatch-file', (_event, absolutePath: string) => {
    const existing = claveWatchers.get(absolutePath)
    if (existing) existing.cleanup()
  })

  // Save dialog for exporting .clave files
  ipcMain.handle(
    'dialog:saveFile',
    async (
      _event,
      defaultName: string,
      filters: { name: string; extensions: string[] }[]
    ): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(_event.sender)
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: defaultName,
        filters
      })
      if (result.canceled || !result.filePath) return null
      return result.filePath
    }
  )

  // Get the Downloads folder path
  ipcMain.handle('app:get-downloads-path', () => app.getPath('downloads'))
  ipcMain.handle('app:get-user-data-path', () => app.getPath('userData'))

  // Preferences get/set
  ipcMain.handle('preferences:get', (_event, key: string) => {
    return preferencesManager.get(key)
  })

  ipcMain.handle('preferences:set', (_event, key: string, value: unknown) => {
    preferencesManager.set(key, value)
  })
}

/** Cleanup all watchers (call on app quit) */
export function cleanupClaveWatchers(): void {
  for (const { cleanup } of claveWatchers.values()) {
    cleanup()
  }
}

// ── Inline preferences manager (simple key-value JSON file) ──

class PreferencesManager {
  private filePath: string
  private cache: Record<string, unknown> = {}

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'clave-preferences.json')
    this.load()
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      this.cache = JSON.parse(raw)
    } catch {
      this.cache = {}
    }
  }

  get(key: string): unknown {
    return this.cache[key] ?? null
  }

  set(key: string, value: unknown): void {
    this.cache[key] = value
    this.save()
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8')
    } catch (err) {
      console.error('[preferences] Failed to save:', err)
    }
  }
}

const preferencesManager = new PreferencesManager()
