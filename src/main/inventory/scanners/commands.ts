// src/main/inventory/scanners/commands.ts
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import type { Dirent } from 'fs'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import { forEachPluginRoot } from '../scan-utils'
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
  return out
}

export async function scanCommands(): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const out: InventoryEntry[] = []
  out.push(...(await scanCommandsDir(path.join(home, '.claude', 'commands'), 'user', undefined)))

  await forEachPluginRoot(async (pluginRoot, pluginName) => {
    out.push(...(await scanCommandsDir(path.join(pluginRoot, 'commands'), 'plugin', pluginName)))
  })

  return out
}
