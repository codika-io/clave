// src/main/inventory/scanners/hooks.ts
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import type { InventoryEntry, InventorySource } from '../../../shared/inventory-types'

interface HookSpec {
  matcher?: string
  hooks?: Array<{ type?: string; command?: string }>
}

function extractHookEntries(
  raw: unknown,
  filePath: string,
  source: InventorySource,
  pluginName: string | undefined,
  out: InventoryEntry[]
): void {
  if (typeof raw !== 'object' || raw === null) return
  const hooks = (raw as Record<string, unknown>).hooks
  if (typeof hooks !== 'object' || hooks === null) return
  for (const [event, specs] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(specs)) continue
    for (const spec of specs as HookSpec[]) {
      const matcher = spec.matcher ?? '*'
      const commands = spec.hooks?.map((h) => h.command ?? '').join(' | ') ?? ''
      out.push({
        id: `hook:${filePath}:${event}:${matcher}`,
        category: 'hooks',
        name: `${event} ${matcher}`,
        source,
        pluginName,
        filePath,
        description: commands,
        estimatedTokens: estimateTokens(`${event} ${matcher} ${commands}`)
      })
    }
  }
}

async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name))
  } catch {
    return []
  }
}

async function readJson(filePath: string): Promise<unknown | null> {
  const content = await contentCache.readIfChanged(filePath)
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function scanHooks(cwd: string): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const out: InventoryEntry[] = []

  const userSettings = await readJson(path.join(home, '.claude', 'settings.json'))
  if (userSettings)
    extractHookEntries(userSettings, path.join(home, '.claude', 'settings.json'), 'user', undefined, out)

  // Project settings walking up
  let current = path.resolve(cwd)
  const visited = new Set<string>()
  while (!visited.has(current)) {
    visited.add(current)
    const projectSettings = path.join(current, '.claude', 'settings.json')
    const parsed = await readJson(projectSettings)
    if (parsed) extractHookEntries(parsed, projectSettings, 'project', undefined, out)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  // Plugin hooks
  const pluginCache = path.join(home, '.claude', 'plugins', 'cache')
  const marketplaces = await listDirs(pluginCache)
  for (const marketplace of marketplaces) {
    const plugins = await listDirs(marketplace)
    for (const plugin of plugins) {
      const versions = await listDirs(plugin)
      const pluginRoots = versions.length > 0 ? versions : [plugin]
      for (const pluginRoot of pluginRoots) {
        const hooksFile = path.join(pluginRoot, 'hooks', 'hooks.json')
        const parsed = await readJson(hooksFile)
        if (parsed) extractHookEntries(parsed, hooksFile, 'plugin', path.basename(plugin), out)
      }
    }
  }

  return out
}
