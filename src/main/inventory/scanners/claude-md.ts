// src/main/inventory/scanners/claude-md.ts
import * as path from 'path'
import * as os from 'os'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import type { InventoryEntry } from '../../../shared/inventory-types'

export async function scanClaudeMd(cwd: string): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = []
  const home = os.homedir()

  // Walk up from cwd to home (inclusive), stop at filesystem root
  const visited = new Set<string>()
  let current = path.resolve(cwd)
  while (!visited.has(current)) {
    visited.add(current)
    const candidate = path.join(current, 'CLAUDE.md')
    const content = await contentCache.readIfChanged(candidate)
    if (content) {
      entries.push({
        id: `claude-md:${candidate}`,
        category: 'claude-md',
        name: path.relative(home, candidate) || candidate,
        source: current.startsWith(home) && current !== home ? 'project' : 'user',
        filePath: candidate,
        estimatedTokens: estimateTokens(content)
      })
    }
    const parent = path.dirname(current)
    if (parent === current) break
    if (!parent.startsWith(home) && current === home) break
    current = parent
  }

  // Always check global ~/.claude/CLAUDE.md
  const globalClaude = path.join(home, '.claude', 'CLAUDE.md')
  if (!entries.find((e) => e.filePath === globalClaude)) {
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
