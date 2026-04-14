// src/main/inventory/scanners/plugins.ts
import * as path from 'path'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import { forEachPluginRoot } from '../scan-utils'
import type { InventoryEntry } from '../../../shared/inventory-types'

export async function scanPlugins(): Promise<InventoryEntry[]> {
  const out: InventoryEntry[] = []

  await forEachPluginRoot(async (pluginRoot, pluginDirName) => {
    const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json')
    const content = await contentCache.readIfChanged(manifestPath)
    if (!content) return

    let manifest: { name?: string; description?: string; version?: string }
    try {
      manifest = JSON.parse(content)
    } catch {
      return
    }
    const name = manifest.name || pluginDirName
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
  })

  return out
}
