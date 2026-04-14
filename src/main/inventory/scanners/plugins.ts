// src/main/inventory/scanners/plugins.ts
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import type { InventoryEntry } from '../../../shared/inventory-types'

async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name))
  } catch {
    return []
  }
}

export async function scanPlugins(): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const root = path.join(home, '.claude', 'plugins', 'cache')
  const out: InventoryEntry[] = []

  const marketplaces = await listDirs(root)
  for (const marketplace of marketplaces) {
    const plugins = await listDirs(marketplace)
    for (const plugin of plugins) {
      const versions = await listDirs(plugin)
      const pluginRoots = versions.length > 0 ? versions : [plugin]
      for (const pluginRoot of pluginRoots) {
        const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json')
        const content = await contentCache.readIfChanged(manifestPath)
        if (!content) continue
        let manifest: { name?: string; description?: string; version?: string } = {}
        try {
          manifest = JSON.parse(content)
        } catch {
          continue
        }
        const name = manifest.name || path.basename(plugin)
        const description = manifest.description || ''
        const headerLine = `${name} (v${manifest.version ?? '?'}): ${description}`
        out.push({
          id: `plugin:${manifestPath}`,
          category: 'plugins',
          name,
          source: 'plugin',
          pluginName: name,
          filePath: manifestPath,
          description,
          estimatedTokens: estimateTokens(headerLine),
          notes: 'Manifest only; skills/commands/MCPs counted separately'
        })
      }
    }
  }
  return out
}
