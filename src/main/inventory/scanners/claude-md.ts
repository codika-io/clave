// src/main/inventory/scanners/claude-md.ts
import * as path from 'path'
import * as os from 'os'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import { walkUpFromCwd } from '../scan-utils'
import type { InventoryEntry } from '../../../shared/inventory-types'

export async function scanClaudeMd(cwd: string): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = []
  const home = os.homedir()

  await walkUpFromCwd(cwd, async (dir) => {
    const candidate = path.join(dir, 'CLAUDE.md')
    const content = await contentCache.readIfChanged(candidate)
    if (!content) return
    entries.push({
      id: `claude-md:${candidate}`,
      category: 'claude-md',
      name: path.relative(home, candidate) || candidate,
      source: dir.startsWith(home) && dir !== home ? 'project' : 'user',
      filePath: candidate,
      estimatedTokens: estimateTokens(content)
    })
  })

  // Always check global ~/.claude/CLAUDE.md (not necessarily on the walk path)
  const globalClaude = path.join(home, '.claude', 'CLAUDE.md')
  if (!entries.some((e) => e.filePath === globalClaude)) {
    const content = await contentCache.readIfChanged(globalClaude)
    if (content) {
      entries.push({
        id: `claude-md:${globalClaude}`,
        category: 'claude-md',
        name: '~/.claude/CLAUDE.md',
        source: 'user',
        filePath: globalClaude,
        estimatedTokens: estimateTokens(content)
      })
    }
  }

  return entries
}
