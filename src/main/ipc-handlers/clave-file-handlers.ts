import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function readImageAsDataUrl(absolutePath: string): string | null {
  try {
    if (!fs.existsSync(absolutePath)) return null
    const ext = path.extname(absolutePath).toLowerCase().slice(1)
    const mime = ext === 'svg' ? 'image/svg+xml'
      : ext === 'png' ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : ext === 'ico' ? 'image/x-icon'
      : 'application/octet-stream'
    const data = fs.readFileSync(absolutePath)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

/** Active .clave file watchers keyed by absolute file path */
const claveWatchers = new Map<string, { watcher: fs.FSWatcher; cleanup: () => void }>()

/** Suppress file-changed events briefly after we write (to avoid echo) */
const recentWrites = new Set<string>()

interface ClaveGroupData {
  name: string
  cwd: string
  color: string | null
  toolbar?: boolean
  category?: string
  logo?: string
  sessions: { cwd: string; name: string; claudeMode: boolean; geminiMode: boolean; dangerousMode: boolean }[]
  terminals: { command: string; commandMode: 'prefill' | 'auto'; color: string; icon?: string; cwd?: string; autoLaunchLocalhost?: boolean }[]
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
  category?: string
  logo?: string
  // Multi-group format
  groups?: Array<{
    name: string
    cwd?: string
    color?: string | null
    toolbar?: boolean
    category?: string
    logo?: string
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
  logo?: string
  sessions?: ClaveGroupData['sessions']
  terminals?: ClaveGroupData['terminals']
  groups?: Array<{
    name: string
    cwd: string | null
    color: string | null
    logo?: string
    sessions: ClaveGroupData['sessions']
    terminals: ClaveGroupData['terminals']
  }>
}

function resolveGroup(raw: { name?: string; cwd?: string; color?: string | null; toolbar?: boolean; category?: string; logo?: string; sessions?: ClaveGroupData['sessions']; terminals?: ClaveGroupData['terminals'] }, dir: string, fallbackName: string): ClaveGroupData {
  return {
    name: raw.name || fallbackName,
    cwd: path.resolve(dir, raw.cwd || '.'),
    color: raw.color ?? null,
    toolbar: raw.toolbar ?? undefined,
    category: raw.category ?? undefined,
    logo: raw.logo
      ? raw.logo.startsWith('data:') ? raw.logo : readImageAsDataUrl(path.resolve(dir, raw.logo)) ?? undefined
      : undefined,
    sessions: (raw.sessions || []).map((s) => ({
      cwd: path.resolve(dir, s.cwd || '.'),
      name: s.name,
      claudeMode: s.claudeMode ?? false,
      geminiMode: s.geminiMode ?? false,
      dangerousMode: s.dangerousMode ?? false
    })),
    terminals: (raw.terminals || []).map((t) => ({
      command: t.command || '',
      commandMode: t.commandMode || 'prefill',
      color: t.color || 'blue',
      icon: t.icon,
      cwd: t.cwd ? path.resolve(dir, t.cwd) : undefined,
      autoLaunchLocalhost: t.autoLaunchLocalhost ?? undefined
    }))
  }
}

export function registerClaveFileHandlers(): void {
  // Read a .clave file and resolve relative paths to absolute
  // Optional rootDir overrides the default (file's parent dir) for path resolution
  ipcMain.handle(
    'clave:read-file',
    async (_event, absolutePath: string, rootDir?: string): Promise<ClaveFileReadResult | null> => {
      try {
        const raw = fs.readFileSync(absolutePath, 'utf-8')
        const data: ClaveFileRaw = JSON.parse(raw)
        const dir = rootDir || path.dirname(absolutePath)
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
  // Optional rootDir overrides the default (file's parent dir) for path resolution
  ipcMain.handle(
    'clave:write-file',
    async (_event, absolutePath: string, pinned: ClaveFileWriteData, rootDir?: string): Promise<void> => {
      try {
        const dir = rootDir || path.dirname(absolutePath)

        const toRelative = (abs: string | null): string => {
          if (!abs) return '.'
          const rel = path.relative(dir, abs)
          return rel === '' ? '.' : rel
        }

        const serializeGroup = (g: { name: string; cwd: string | null; color: string | null; toolbar?: boolean; category?: string; logo?: string; sessions: ClaveGroupData['sessions']; terminals: ClaveGroupData['terminals'] }) => ({
          name: g.name,
          cwd: toRelative(g.cwd),
          color: g.color,
          ...(g.toolbar ? { toolbar: true } : {}),
          ...(g.category ? { category: g.category } : {}),
          ...(g.logo ? { logo: g.logo.startsWith('data:') ? g.logo : toRelative(g.logo) } : {}),
          sessions: g.sessions.map((s) => ({
            cwd: toRelative(s.cwd),
            name: s.name,
            claudeMode: s.claudeMode,
            geminiMode: s.geminiMode,
            dangerousMode: s.dangerousMode
          })),
          terminals: g.terminals.map((t) => ({
            command: t.command,
            commandMode: t.commandMode,
            color: t.color,
            ...(t.icon ? { icon: t.icon } : {}),
            ...(t.cwd ? { cwd: toRelative(t.cwd) } : {}),
            ...(t.autoLaunchLocalhost ? { autoLaunchLocalhost: true } : {})
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
              logo: pinned.logo,
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

  // Discover .clave files in a folder (legacy workspace.clave + .clave/workspaces/*.clave)
  // rootDir: the folder paths should be resolved relative to (= the selected folder)
  // For legacy workspace.clave, rootDir is null (same as file's parent dir)
  // For .clave/workspaces/*.clave, rootDir is the selected folder
  ipcMain.handle(
    'clave:discover-files',
    async (_event, folderPath: string): Promise<{ name: string; path: string; rootDir: string | null }[]> => {
      const results: { name: string; path: string; rootDir: string | null }[] = []

      // Legacy: direct workspace.clave in the folder (paths relative to its own dir = folderPath)
      const directFile = path.join(folderPath, 'workspace.clave')
      if (fs.existsSync(directFile)) {
        results.push({ name: 'workspace', path: directFile, rootDir: null })
      }

      // New: scan .clave/workspaces/*.clave (paths relative to the root folder)
      const workspacesDir = path.join(folderPath, '.clave', 'workspaces')
      try {
        if (fs.existsSync(workspacesDir) && fs.statSync(workspacesDir).isDirectory()) {
          const entries = fs.readdirSync(workspacesDir)
          for (const entry of entries) {
            if (entry.endsWith('.clave')) {
              results.push({
                name: path.basename(entry, '.clave'),
                path: path.join(workspacesDir, entry),
                rootDir: folderPath
              })
            }
          }
        }
      } catch (err) {
        console.warn('[clave] Failed to scan workspaces dir:', workspacesDir, err)
      }

      return results
    }
  )

  // Recursively discover .clave files under a root directory
  // Used by workspaces with autoDiscover enabled
  ipcMain.handle(
    'clave:discover-files-recursive',
    async (_event, rootDir: string, config?: { patterns?: string[]; exclude?: string[]; maxDepth?: number; workspaceId?: string }): Promise<{ name: string; path: string; rootDir: string }[]> => {
      const patterns = config?.patterns ?? ['workspace.clave', '.clave/workspace.clave']
      const exclude = new Set(config?.exclude ?? ['node_modules', '.git', 'references', 'build', 'dist', '.next', '.turbo'])
      const maxDepth = config?.maxDepth ?? 4
      const workspaceId = config?.workspaceId // e.g. "romain" → prefer romain.clave over default.clave
      const results: { name: string; path: string; rootDir: string }[] = []

      function findClaveFile(dir: string): string | null {
        // 1. Check fixed pattern files
        for (const pattern of patterns) {
          const filePath = path.join(dir, pattern)
          if (fs.existsSync(filePath)) return filePath
        }
        // 2. Check .clave/workspaces/*.clave — priority: {workspaceId}.clave → default.clave → first found
        const wsDir = path.join(dir, '.clave', 'workspaces')
        try {
          if (fs.existsSync(wsDir) && fs.statSync(wsDir).isDirectory()) {
            const files = fs.readdirSync(wsDir).filter((f) => f.endsWith('.clave'))
            if (files.length > 0) {
              if (workspaceId) {
                const personal = files.find((f) => f === `${workspaceId}.clave`)
                if (personal) return path.join(wsDir, personal)
              }
              const defaultFile = files.find((f) => f === 'default.clave')
              return path.join(wsDir, defaultFile ?? files[0])
            }
          }
        } catch { /* ignore */ }
        return null
      }

      async function scan(dir: string, depth: number): Promise<void> {
        if (depth > maxDepth) return
        let entries: fs.Dirent[]
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }

        const found = findClaveFile(dir)
        if (found) {
          results.push({ name: path.basename(dir), path: found, rootDir: dir })
        }

        // Recurse into subdirectories
        const subdirs = entries.filter((e) => e.isDirectory() && !exclude.has(e.name) && !e.name.startsWith('.'))
        await Promise.all(subdirs.map((d) => scan(path.join(dir, d.name), depth + 1)))
      }

      await scan(rootDir, 0)
      // Sort alphabetically by name for stable ordering
      results.sort((a, b) => a.name.localeCompare(b.name))
      return results
    }
  )

  // Read autoDiscover config from a .clave file (lightweight, no group parsing)
  ipcMain.handle(
    'clave:read-auto-discover',
    async (_event, filePath: string): Promise<{ enabled: boolean; patterns?: string[]; exclude?: string[]; maxDepth?: number } | null> => {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const data = JSON.parse(raw)
        if (!data.autoDiscover) return null
        if (data.autoDiscover === true) return { enabled: true }
        return data.autoDiscover
      } catch {
        return null
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

  // Read an image file and return as data URL
  ipcMain.handle('clave:read-image', (_event, absolutePath: string): string | null => {
    return readImageAsDataUrl(absolutePath)
  })

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
