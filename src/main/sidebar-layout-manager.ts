import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import {
  concatLayouts,
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
 *  ONE FILE PER WINDOW since multi-window (PRDCT-1703): a window is the whole
 *  app once more, and its sidebar is its own — `sidebar-layouts/windows/
 *  <windowKey>.json`, read and written by that window alone, so there is no
 *  ownership rule and nothing to arbitrate. Groups keep their `workspaceId`
 *  stamp inside the file (the window shows the ones of its active workspace,
 *  as it always did). A file whose window no longer exists is an ORPHAN: the
 *  primary window takes it in at its next boot.
 *
 *  Two older shapes migrate into the first window's file, once, on the first
 *  boot of this build: the single `sidebar-layout.json` every release before
 *  multi-window wrote, and the per-workspace `sidebar-layouts/<workspaceId>.
 *  json` files of the halted one-workspace-per-window build (dev only).
 *  Sources are RENAMED to `.migrated-backup`, never deleted. */
export type SidebarLayout = SidebarLayoutData

export const LEGACY_LAYOUT_FILE = 'sidebar-layout.json'
export const LAYOUTS_DIR = 'sidebar-layouts'
export const WINDOW_LAYOUTS_DIR = 'windows'
export const MIGRATED_BACKUP_SUFFIX = '.migrated-backup'

/** Keys become file names: only the id alphabet we mint (uuids) is accepted,
 *  so a malformed key can never escape the layouts directory. */
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

export const EMPTY_LAYOUT: SidebarLayout = { groups: [], displayOrder: [] }

export class SidebarLayoutManager {
  private readonly legacyPath: string
  private readonly workspaceDir: string
  private readonly windowDir: string

  constructor(userData: string) {
    this.legacyPath = path.join(userData, LEGACY_LAYOUT_FILE)
    this.workspaceDir = path.join(userData, LAYOUTS_DIR)
    this.windowDir = path.join(userData, LAYOUTS_DIR, WINDOW_LAYOUTS_DIR)
  }

  fileForWindow(key: string): string | null {
    return isValidLayoutKey(key) ? path.join(this.windowDir, `${key}.json`) : null
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

  /** A window's own layout; empty when it has none yet. */
  loadForWindow(key: string): SidebarLayout {
    const file = this.fileForWindow(key)
    return (file ? this.readFile(file) : null) ?? { groups: [], displayOrder: [] }
  }

  saveForWindow(key: string, data: SidebarLayout): boolean {
    const file = this.fileForWindow(key)
    if (!file) return false
    this.writeFile(file, data)
    return true
  }

  /** Drop a window's file — after its content was handed to another window
   *  (a close, an orphan take). Missing is fine. */
  deleteForWindow(key: string): void {
    const file = this.fileForWindow(key)
    if (!file) return
    try {
      fs.unlinkSync(file)
    } catch {
      /* already gone */
    }
  }

  /** Keys of every window layout file on disk that belongs to none of
   *  `knownKeys` — layouts whose window no longer exists. */
  orphanKeys(knownKeys: Set<string>): string[] {
    let files: string[] = []
    try {
      files = fs.readdirSync(this.windowDir).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
    return files
      .map((f) => f.slice(0, -'.json'.length))
      .filter((k) => isValidLayoutKey(k) && !knownKeys.has(k))
  }

  /** The orphans' layouts concatenated, and their files removed — the take
   *  is one-shot; the taker persists what it merged into its own file. */
  takeOrphans(knownKeys: Set<string>): SidebarLayout {
    const keys = this.orphanKeys(knownKeys)
    if (keys.length === 0) return { groups: [], displayOrder: [] }
    const layouts = keys.map((k) => this.loadForWindow(k))
    for (const k of keys) this.deleteForWindow(k)
    console.log(`[sidebar-layout] primary took ${keys.length} orphan window layout(s)`)
    return concatLayouts(layouts)
  }

  /**
   * One-time migration into the FIRST window's file, run by main on the first
   * boot with no windows.json. Gathers, in this order: the legacy single file
   * (partitioned by workspace when any is registered — that stamps each
   * unstamped group with the workspace its cwd falls under, the same rule the
   * halted build applied — else taken as is), then every per-workspace file.
   * Concatenated (ids deduplicated), written under `windowKey`, every source
   * renamed to `.migrated-backup`. Idempotent: a second run finds no sources.
   * Returns the number of sources migrated.
   */
  migrateIntoWindow(windowKey: string, ctx: PartitionContext | null): number {
    const sources: { file: string; layout: SidebarLayout | null }[] = []
    if (fs.existsSync(this.legacyPath)) {
      const legacy = this.readFile(this.legacyPath)
      let layout: SidebarLayout | null = legacy
      if (legacy && ctx && ctx.workspaceIds.length > 0) {
        layout = concatLayouts([...partitionLegacyLayout(legacy, ctx).values()])
      }
      sources.push({ file: this.legacyPath, layout })
    }
    let perWorkspace: string[] = []
    try {
      perWorkspace = fs
        .readdirSync(this.workspaceDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => path.join(this.workspaceDir, f))
    } catch {
      perWorkspace = []
    }
    for (const file of perWorkspace) sources.push({ file, layout: this.readFile(file) })
    if (sources.length === 0) return 0

    const merged = concatLayouts(
      [this.loadForWindow(windowKey), ...sources.map((s) => s.layout)].filter(
        (l): l is SidebarLayout => l !== null
      )
    )
    this.saveForWindow(windowKey, merged)
    for (const s of sources) {
      // Unreadable sources are parked too, so they are never re-attempted
      // (and never lost) — there is nothing to migrate from them.
      fs.renameSync(s.file, `${s.file}${MIGRATED_BACKUP_SUFFIX}`)
    }
    console.log(
      `[sidebar-layout] migrated ${sources.length} layout file(s) into window ${windowKey}; sources kept as ${MIGRATED_BACKUP_SUFFIX}`
    )
    return sources.length
  }
}

export const sidebarLayoutManager = new SidebarLayoutManager(app.getPath('userData'))
