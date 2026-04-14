// src/main/inventory/scanners/agents.ts
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import type { Dirent } from 'fs'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import { forEachPluginRoot, parseFrontmatter } from '../scan-utils'
import type { InventoryEntry, InventorySource } from '../../../shared/inventory-types'

async function scanAgentsDir(
  dir: string,
  source: InventorySource,
  pluginName: string | undefined
): Promise<InventoryEntry[]> {
  const out: InventoryEntry[] = []
  let files: Dirent[]
  try {
    files = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith('.md')) continue
    const full = path.join(dir, f.name)
    const content = await contentCache.readIfChanged(full)
    if (!content) continue
    const fm = parseFrontmatter(content)
    const name = fm.name || f.name.replace(/\.md$/, '')
    const description = fm.description || ''
    out.push({
      id: `agent:${full}`,
      category: 'agents',
      name,
      source,
      pluginName,
      filePath: full,
      description,
      estimatedTokens: estimateTokens(`${name}: ${description}`)
    })
  }
  return out
}

export async function scanAgents(): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const out: InventoryEntry[] = []
  out.push(...(await scanAgentsDir(path.join(home, '.claude', 'agents'), 'user', undefined)))

  await forEachPluginRoot(async (pluginRoot, pluginName) => {
    out.push(...(await scanAgentsDir(path.join(pluginRoot, 'agents'), 'plugin', pluginName)))
  })

  return out
}
