import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import {
  concatLayouts,
  mergeLayouts,
  partitionLegacyLayout,
  type PartitionContext,
  type SidebarLayoutData
} from './sidebar-layout-migration'

/** Persisted sidebar layout: the session groups and the top-level display
 *  order that nests them. Sessions themselves survive via tmux sidecars; this
 *  is the group metadata (names, colors, terminals, ordering) that organizes
 *  them, written from the main process so it survives a hard kill (Ctrl+C /
 *  crash) the way Chromium's lazily-flushed localStorage does not.
 *
 *  Keyed PER WORKSPACE since multi-window (PRDCT-1703): a window shows one
 *  workspace, so two windows writing one global file erased each other on
 *  every change. Each workspace's layout lives in
 *  `sidebar-layouts/<workspaceId>.json`; the null key — no-workspace mode,
 *  where nothing is stamped — keeps using the legacy `sidebar-layout.json`
 *  exactly as before. The legacy file is migrated the first time a load
 *  happens with at least one registered workspace (see `migrateLegacy`). */
export type SidebarLayout = SidebarLayoutData

/** A layout key: a workspace id, or null for the unscoped (no-workspace) layout. */
export type LayoutKey = string | null

export const LEGACY_LAYOUT_FILE = 'sidebar-layout.json'
export const LAYOUTS_DIR = 'sidebar-layouts'
export const MIGRATED_BACKUP_SUFFIX = '.migrated-backup'

/** Keys become file names: only the id alphabet the registry mints (uuids)
 *  is accepted, so a malformed key can never escape the layouts directory. */
export function isValidLayoutKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(key)
}

function normalize(data: unknown): SidebarLayout {
  const d = data as Partial<SidebarLayout> | null
  return {
    groups: Array.isArray(d?.groups) ? d!.groups : [],
    displayOrder: Array.isArray(d?.displayOrder) ? d!.displayOrder : []
  }
}

class SidebarLayoutManager {
  private readonly legacyPath: string
  private readonly dir: string

  constructor() {
    const userData = app.getPath('userData')
    this.legacyPath = path.join(userData, LEGACY_LAYOUT_FILE)
    this.dir = path.join(userData, LAYOUTS_DIR)
  }

  fileFor(key: LayoutKey): string | null {
    if (key === null) return this.legacyPath
    return isValidLayoutKey(key) ? path.join(this.dir, `${key}.json`) : null
  }

  private readFile(file: string): SidebarLayout | null {
    try {
      return normalize(JSON.parse(fs.readFileSync(file, 'utf-8')))
    } catch {
      return null
    }
  }

  private writeFile(file: string, data: SidebarLayout): void {
    const payload = JSON.stringify(normalize(data), null, 2)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Write-then-rename so a kill mid-write can never leave a truncated file.
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, payload, 'utf-8')
    fs.renameSync(tmp, file)
  }

  loadOne(key: LayoutKey): SidebarLayout {
    const file = this.fileFor(key)
    return (file ? this.readFile(file) : null) ?? { groups: [], displayOrder: [] }
  }

  /** The layouts of several workspaces, concatenated in the given order —
   *  what a window holds in memory: everything it hosts (the primary at boot
   *  hosts every workspace; a secondary window hosts its own). */
  load(keys: LayoutKey[]): SidebarLayout {
    return concatLayouts(keys.map((k) => this.loadOne(k)))
  }

  save(key: LayoutKey, data: SidebarLayout): boolean {
    const file = this.fileFor(key)
    if (!file) return false
    this.writeFile(file, data)
    return true
  }

  /**
   * One-time migration off the single legacy file. Runs only when the legacy
   * file exists AND at least one workspace is registered (in no-workspace
   * mode the legacy file IS the null-key layout and stays in place). Each
   * partition is merged into a per-workspace file that may already exist —
   * a workspace registered mid-run wrote one before this ran — then the
   * legacy file is RENAMED to `sidebar-layout.json.migrated-backup`, never
   * deleted. Idempotent: the second call finds no legacy file and does
   * nothing. Returns the workspaces written, or null when nothing ran.
   */
  migrateLegacy(ctx: PartitionContext): string[] | null {
    if (ctx.workspaceIds.length === 0) return null
    if (!fs.existsSync(this.legacyPath)) return null
    const legacy = this.readFile(this.legacyPath)
    const written: string[] = []
    if (legacy) {
      for (const [ws, partition] of partitionLegacyLayout(legacy, ctx)) {
        const file = this.fileFor(ws)
        if (!file) {
          console.error(
            `[sidebar-layout] migration: ${partition.groups.length} group(s) for an invalid workspace key ${JSON.stringify(ws)} stay only in the backup`
          )
          continue
        }
        const existing = this.readFile(file)
        this.writeFile(file, existing ? mergeLayouts(existing, partition) : partition)
        written.push(ws)
      }
    }
    // Unreadable legacy file: still parked as the backup so it is never
    // re-attempted (and never lost) — there is nothing to partition.
    fs.renameSync(this.legacyPath, `${this.legacyPath}${MIGRATED_BACKUP_SUFFIX}`)
    console.log(
      `[sidebar-layout] migrated ${LEGACY_LAYOUT_FILE} into ${written.length} per-workspace file(s); legacy kept as ${LEGACY_LAYOUT_FILE}${MIGRATED_BACKUP_SUFFIX}`
    )
    return written
  }
}

export const sidebarLayoutManager = new SidebarLayoutManager()
