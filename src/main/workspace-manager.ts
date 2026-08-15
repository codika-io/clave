import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import type { Workspace, WorkspaceStateFile } from '../shared/workspace-types'
import { getPreference, addTrustedRoot } from './ipc-handlers/clave-file-handlers'

/** Resolve symlinks + normalize, mirroring the trust-root normalization so the
 *  same path always compares equal regardless of how it was spelled. */
function normalizeDir(p: string): string {
  try {
    return fs.realpathSync(path.resolve(p))
  } catch {
    return path.resolve(p)
  }
}

/** "/Users/x/.antasphere" → "Antasphere" — strip leading dots, capitalize. */
function workspaceNameFromRoot(rootDir: string): string {
  const base = path.basename(rootDir).replace(/^\.+/, '')
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : rootDir
}

/** True when child is parent itself or lives underneath it (both normalized). */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Shape of the retired per-file registry entries in clave-preferences.json.
 *  Two generations existed: {claveFilePath, rootDir?} and the even older
 *  {path} (a folder holding workspace.clave). Read-only here — the keys are
 *  left in place as an implicit backup and are never written again. */
interface LegacyWorkspaceEntry {
  id?: string
  name?: string
  claveFilePath?: string
  path?: string
  rootDir?: string | null
}

function emptyState(): WorkspaceStateFile {
  return { version: 1, workspaces: [], activeWorkspaceId: null, pins: [], pinsMigrated: true }
}

/** One-time Phase A migration: collapse the retired per-file registry into
 *  per-root workspaces. Runs only when workspace-state.json doesn't exist. */
function migrateLegacyRegistry(): WorkspaceStateFile {
  const rawEntries = getPreference('workspaces')
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) return emptyState()
  const legacyActiveId = getPreference('activeWorkspaceId') as string | null

  const userData = normalizeDir(app.getPath('userData'))
  const byRoot = new Map<string, { entries: LegacyWorkspaceEntry[]; files: string[] }>()
  let activeFile: string | null = null

  for (const entry of rawEntries as LegacyWorkspaceEntry[]) {
    const filePath =
      entry.claveFilePath ?? (entry.path ? path.join(entry.path, 'workspace.clave') : null)
    if (!filePath) continue
    // The generated "Init" snapshot lived in userData — not a real workspace.
    if (isInside(userData, normalizeDir(path.dirname(filePath)))) continue

    const rootDir = normalizeDir(entry.rootDir ?? path.dirname(filePath))
    const group = byRoot.get(rootDir) ?? { entries: [], files: [] }
    group.entries.push(entry)
    group.files.push(filePath)
    byRoot.set(rootDir, group)
    if (entry.id && entry.id === legacyActiveId) activeFile = filePath
  }

  const workspaces: Workspace[] = []
  let activeWorkspaceId: string | null = null

  for (const [rootDir, group] of byRoot) {
    // Profile priority: the file that was active > default.clave > first.
    const profileFile =
      (activeFile && group.files.includes(activeFile) ? activeFile : null) ??
      group.files.find((f) => path.basename(f) === 'default.clave') ??
      group.files[0] ??
      null

    const ws: Workspace = {
      id: randomUUID(),
      name: workspaceNameFromRoot(rootDir),
      rootDir,
      profileFile,
      createdAt: Date.now()
    }
    workspaces.push(ws)
    addTrustedRoot(rootDir)
    if (activeFile && group.files.includes(activeFile)) activeWorkspaceId = ws.id
  }

  if (!activeWorkspaceId && workspaces.length > 0) activeWorkspaceId = workspaces[0].id

  // pinsMigrated: false → the renderer still has to import localStorage pins.
  return { version: 1, workspaces, activeWorkspaceId, pins: [], pinsMigrated: false }
}

/** Persisted workspace registry + pins. Same philosophy as sidebar-layout:
 *  synchronous write-then-rename on every change (survives a hard kill), the
 *  renderer as source of truth during a run, and an in-memory cache so the
 *  PTY layer can stamp spawns synchronously. */
class WorkspaceManager {
  private filePath: string
  private cache: WorkspaceStateFile | null = null

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'workspace-state.json')
  }

  load(): WorkspaceStateFile {
    if (this.cache) return this.cache
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as WorkspaceStateFile
      this.cache = {
        version: 1,
        workspaces: Array.isArray(data.workspaces) ? data.workspaces : [],
        activeWorkspaceId:
          typeof data.activeWorkspaceId === 'string' ? data.activeWorkspaceId : null,
        pins: Array.isArray(data.pins) ? data.pins : [],
        pinsMigrated: data.pinsMigrated !== false
      }
    } catch {
      // First boot of the workspace model — migrate the retired registry.
      this.cache = migrateLegacyRegistry()
      this.persist()
    }
    return this.cache
  }

  save(data: WorkspaceStateFile): void {
    this.cache = {
      version: 1,
      workspaces: Array.isArray(data?.workspaces) ? data.workspaces : [],
      activeWorkspaceId:
        typeof data?.activeWorkspaceId === 'string' ? data.activeWorkspaceId : null,
      pins: Array.isArray(data?.pins) ? data.pins : [],
      pinsMigrated: data?.pinsMigrated !== false
    }
    this.persist()
  }

  private persist(): void {
    if (!this.cache) return
    try {
      const payload = JSON.stringify(this.cache, null, 2)
      // Write-then-rename so a kill mid-write can never leave a truncated file.
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, payload, 'utf-8')
      fs.renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('[workspace] Failed to persist workspace state:', err)
    }
  }

  getActiveWorkspaceId(): string | null {
    return this.load().activeWorkspaceId
  }

  getWorkspaces(): Workspace[] {
    return this.load().workspaces
  }

  /** Workspace whose rootDir contains cwd (longest prefix wins — defense for
   *  nested roots even though registration rejects them). Null when outside
   *  every registered root. Used to place legacy, unstamped session records. */
  resolveWorkspaceForCwd(cwd: string): string | null {
    const real = normalizeDir(cwd)
    let best: { id: string; len: number } | null = null
    for (const ws of this.load().workspaces) {
      if (isInside(ws.rootDir, real) && (!best || ws.rootDir.length > best.len)) {
        best = { id: ws.id, len: ws.rootDir.length }
      }
    }
    return best?.id ?? null
  }
}

export const workspaceManager = new WorkspaceManager()
