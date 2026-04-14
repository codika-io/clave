// src/main/inventory/scan-utils.ts
// Shared helpers used by multiple inventory scanners.
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { contentCache } from './content-cache'

export async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name))
  } catch {
    return []
  }
}

export async function readJson(filePath: string): Promise<unknown | null> {
  const content = await contentCache.readIfChanged(filePath)
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const out: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) out[key] = value
  }
  return out
}

/**
 * Walks up from `startDir` toward the filesystem root, invoking `visit` at each
 * directory. Guards against symlink loops via a visited set.
 */
export async function walkUpFromCwd(
  startDir: string,
  visit: (dir: string) => Promise<void>
): Promise<void> {
  const visited = new Set<string>()
  let current = path.resolve(startDir)
  while (!visited.has(current)) {
    visited.add(current)
    await visit(current)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}

/**
 * Iterates all installed plugin roots under `~/.claude/plugins/cache`.
 * Each plugin is typically versioned: `cache/<marketplace>/<plugin>/<version>`,
 * but we also fall back to `cache/<marketplace>/<plugin>` when no version
 * subdirectories exist.
 */
export async function forEachPluginRoot(
  visit: (pluginRoot: string, pluginName: string) => Promise<void>
): Promise<void> {
  const pluginCache = path.join(os.homedir(), '.claude', 'plugins', 'cache')
  const marketplaces = await listDirs(pluginCache)
  for (const marketplace of marketplaces) {
    const plugins = await listDirs(marketplace)
    for (const plugin of plugins) {
      const versions = await listDirs(plugin)
      const pluginRoots = versions.length > 0 ? versions : [plugin]
      const pluginName = path.basename(plugin)
      for (const pluginRoot of pluginRoots) {
        await visit(pluginRoot, pluginName)
      }
    }
  }
}
