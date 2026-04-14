// src/main/inventory/scanners/agents.ts
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import type { InventoryEntry, InventorySource } from '../../../shared/inventory-types'

function parseFrontmatter(content: string): Record<string, string> {
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

async function scanAgentsDir(
  dir: string,
  source: InventorySource,
  pluginName: string | undefined
): Promise<InventoryEntry[]> {
  const out: InventoryEntry[] = []
  try {
    const files = await fs.readdir(dir, { withFileTypes: true })
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
  } catch {
    return out
  }
  return out
}

async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name))
  } catch {
    return []
  }
}

export async function scanAgents(): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const out: InventoryEntry[] = []
  out.push(...(await scanAgentsDir(path.join(home, '.claude', 'agents'), 'user', undefined)))

  const pluginCache = path.join(home, '.claude', 'plugins', 'cache')
  const marketplaces = await listDirs(pluginCache)
  for (const marketplace of marketplaces) {
    const plugins = await listDirs(marketplace)
    for (const plugin of plugins) {
      const versions = await listDirs(plugin)
      const pluginRoots = versions.length > 0 ? versions : [plugin]
      for (const pluginRoot of pluginRoots) {
        out.push(
          ...(await scanAgentsDir(path.join(pluginRoot, 'agents'), 'plugin', path.basename(plugin)))
        )
      }
    }
  }
  return out
}
