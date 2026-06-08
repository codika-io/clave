import * as fs from 'fs'
import * as path from 'path'
import {
  DISCOVERY_SKIP_NAMES,
  DISCOVERY_SKIP_PATHS,
  DISCOVERY_CONCURRENCY,
  MAX_DISCOVERY_DIRS,
  MAX_DISCOVERY_REPOS,
  DISCOVERY_CACHE_TTL_MS
} from './constants'

export interface RepoInfo {
  name: string
  path: string
}

export interface DiscoverResult {
  repos: RepoInfo[]
  /** true when the scan hit a cap and may be incomplete */
  truncated: boolean
}

interface ScanEntry {
  repos: RepoInfo[]
  /** true when the full subtree was traversed within budget (no cap hit) */
  complete: boolean
  scannedAt: number
}

/** Normalize to an absolute path with no trailing slash (root stays "/"). */
function normalize(p: string): string {
  const resolved = path.resolve(p)
  if (resolved === '/') return '/'
  return resolved.replace(/\/+$/, '')
}

/** Is `child` equal to or nested under `ancestor`? */
function isAncestor(ancestor: string, child: string): boolean {
  if (ancestor === child) return true
  const base = ancestor === '/' ? '/' : ancestor + '/'
  return child.startsWith(base)
}

/** Is `child` strictly nested under `parent` (not equal)? */
function isStrictlyUnder(parent: string, child: string): boolean {
  return child !== parent && isAncestor(parent, child)
}

async function isRepoDir(dir: string): Promise<boolean> {
  try {
    await fs.promises.access(path.join(dir, '.git'))
    return true
  } catch {
    return false
  }
}

/**
 * Stateful, cached, incremental discovery of git repos beneath a directory.
 *
 * The filesystem is treated as one shared object: a scan of a parent reuses the
 * cached results of any already-scanned children (no recomputation), and opening
 * a child of an already-scanned parent is served entirely from cache (no scan).
 *
 * Scans are bounded (concurrency, dir count, repo count, system-path skips) so
 * even opening "/" cannot spike — it degrades to a truncated result instead.
 *
 * Scans run to completion in the main process regardless of who requested them,
 * so a discovery triggered by opening the git panel still finishes and caches
 * even if the user immediately switches back to the files tab.
 */
class RepoIndexManager {
  private cache = new Map<string, ScanEntry>()
  private inflight = new Map<string, Promise<DiscoverResult>>()

  /** Wipe all cached scans (used by an explicit user refresh). */
  clear(): void {
    this.cache.clear()
  }

  private freshComplete(p: string): ScanEntry | null {
    const entry = this.cache.get(p)
    if (!entry || !entry.complete) return null
    if (Date.now() - entry.scannedAt > DISCOVERY_CACHE_TTL_MS) return null
    return entry
  }

  /** Smallest fresh, complete cached ancestor that already covers `cwd`. */
  private findCoveringAncestor(cwd: string): ScanEntry | null {
    let best: ScanEntry | null = null
    let bestLen = -1
    for (const [key, entry] of this.cache) {
      if (!entry.complete) continue
      if (Date.now() - entry.scannedAt > DISCOVERY_CACHE_TTL_MS) continue
      if (isAncestor(key, cwd) && key.length > bestLen) {
        best = entry
        bestLen = key.length
      }
    }
    return best
  }

  async discover(cwdRaw: string, force = false): Promise<DiscoverResult> {
    const cwd = normalize(cwdRaw)

    if (force) {
      this.clear()
    } else {
      // Exact fresh hit.
      const exact = this.freshComplete(cwd)
      if (exact) return { repos: exact.repos, truncated: false }

      // Covered by a larger, already-scanned ancestor → filter, no scan.
      const ancestor = this.findCoveringAncestor(cwd)
      if (ancestor) {
        return {
          repos: ancestor.repos.filter((r) => isStrictlyUnder(cwd, r.path)),
          truncated: false
        }
      }
    }

    // De-dupe concurrent scans of the same root (e.g. the 5s poll racing itself).
    const pending = this.inflight.get(cwd)
    if (pending && !force) return pending

    const scanPromise = this.scan(cwd).finally(() => {
      this.inflight.delete(cwd)
    })
    this.inflight.set(cwd, scanPromise)
    return scanPromise
  }

  private async scan(root: string): Promise<DiscoverResult> {
    const found = new Map<string, RepoInfo>()
    let dirsVisited = 0
    let truncated = false

    // Breadth-first (head pointer, not pop) so shallow repos — the common case —
    // are found before the dir-count budget is exhausted on a deep, repo-less
    // branch. Critical for big trees like "/" or a home directory.
    const queue: string[] = [root]
    let head = 0

    const capHit = (): boolean =>
      found.size >= MAX_DISCOVERY_REPOS || dirsVisited >= MAX_DISCOVERY_DIRS

    const addRepo = (name: string, p: string): void => {
      if (!found.has(p)) found.set(p, { name, path: p })
    }

    const worker = async (): Promise<void> => {
      while (head < queue.length) {
        if (capHit()) {
          truncated = true
          return
        }
        const dir = queue[head++]
        dirsVisited++

        let entries: fs.Dirent[]
        try {
          entries = await fs.promises.readdir(dir, { withFileTypes: true })
        } catch {
          continue // unreadable directory (permissions, etc.)
        }

        for (const e of entries) {
          if (!e.isDirectory() && !e.isSymbolicLink()) continue
          if (DISCOVERY_SKIP_NAMES.has(e.name)) continue

          const full = path.join(dir, e.name)
          if (DISCOVERY_SKIP_PATHS.has(full)) continue

          // Reuse a previously-scanned complete subtree instead of descending.
          const cached = this.freshComplete(full)
          if (cached) {
            if (await isRepoDir(full)) addRepo(e.name, full)
            for (const r of cached.repos) addRepo(r.name, r.path)
            continue
          }

          if (await isRepoDir(full)) {
            // A repo root: record it, don't descend (nested repos are rare and
            // surface via their own scan if the user opens them directly).
            addRepo(e.name, full)
            continue
          }

          queue.push(full)
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(DISCOVERY_CONCURRENCY, 64) }, () => worker()))

    const repos = Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name))

    this.cache.set(root, { repos, complete: !truncated, scannedAt: Date.now() })

    // A complete scan of `root` subsumes any cached descendant scans — drop them
    // so the cache stays small and the covering-ancestor lookup is cheap.
    if (!truncated) {
      for (const key of this.cache.keys()) {
        if (key !== root && isStrictlyUnder(root, key)) this.cache.delete(key)
      }
    }

    return { repos, truncated }
  }
}

export const repoIndexManager = new RepoIndexManager()
