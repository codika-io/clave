// src/main/inventory/scanners/memory.ts
import * as path from 'path'
import * as os from 'os'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import type { InventoryEntry } from '../../../shared/inventory-types'

function sanitizeCwd(cwd: string): string {
  return cwd.replace(/[/\\]/g, '-').replace(/^-/, '-')
}

export async function scanMemory(cwd: string): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const projectKey = sanitizeCwd(path.resolve(cwd))
  const memoryFile = path.join(home, '.claude', 'projects', projectKey, 'memory', 'MEMORY.md')
  const content = await contentCache.readIfChanged(memoryFile)
  if (!content) return []
  return [
    {
      id: `memory:${memoryFile}`,
      category: 'memory',
      name: 'Auto memory (MEMORY.md)',
      source: 'user',
      filePath: memoryFile,
      estimatedTokens: estimateTokens(content),
      notes: 'Index is loaded; individual memory files load on demand'
    }
  ]
}
