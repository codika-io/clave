// src/main/inventory/scanners/commands.ts
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import type { InventoryEntry, InventorySource } from '../../../shared/inventory-types'

function firstLine(content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)
  if (heading) return heading[1].trim()
  return content.split('\n')[0]?.slice(0, 120) ?? ''
}

async function scanCommandsDir(
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
      const name = f.name.replace(/\.md$/, '')
      const description = firstLine(content)
      out.push({
        id: `command:${full}`,
        category: 'commands',
        name,
        source,
        pluginName,
        filePath: full,
        description,
        estimatedTokens: estimateTokens(`${name}: ${description}`),
        notes: 'Slash command index entry; body loads on invocation'
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

export async function scanCommands(): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const out: InventoryEntry[] = []
  out.push(...(await scanCommandsDir(path.join(home, '.claude', 'commands'), 'user', undefined)))

  const pluginCache = path.join(home, '.claude', 'plugins', 'cache')
  const marketplaces = await listDirs(pluginCache)
  for (const marketplace of marketplaces) {
    const plugins = await listDirs(marketplace)
    for (const plugin of plugins) {
      const versions = await listDirs(plugin)
      const pluginRoots = versions.length > 0 ? versions : [plugin]
      for (const pluginRoot of pluginRoots) {
        out.push(
          ...(await scanCommandsDir(path.join(pluginRoot, 'commands'), 'plugin', path.basename(plugin)))
        )
      }
    }
  }
  return out
}
