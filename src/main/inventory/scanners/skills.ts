// src/main/inventory/scanners/skills.ts
import * as path from 'path'
import * as os from 'os'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import { forEachPluginRoot, listDirs, parseFrontmatter } from '../scan-utils'
import type { InventoryEntry } from '../../../shared/inventory-types'

async function scanSkillsDir(
  skillsRoot: string,
  source: 'user' | 'plugin',
  pluginName?: string
): Promise<InventoryEntry[]> {
  const out: InventoryEntry[] = []
  const dirs = await listDirs(skillsRoot)
  for (const dir of dirs) {
    const skillFile = path.join(dir, 'SKILL.md')
    const content = await contentCache.readIfChanged(skillFile)
    if (!content) continue
    const fm = parseFrontmatter(content)
    const name = fm.name || path.basename(dir)
    const description = fm.description || ''
    const indexLine = `${name}: ${description}`
    out.push({
      id: `skill:${skillFile}`,
      category: 'skills',
      name: pluginName ? `${pluginName}:${name}` : name,
      source,
      pluginName,
      filePath: skillFile,
      description,
      estimatedTokens: estimateTokens(indexLine),
      notes: 'Index line only; body loads on invocation'
    })
  }
  return out
}

export async function scanSkills(): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const entries: InventoryEntry[] = []
  entries.push(...(await scanSkillsDir(path.join(home, '.claude', 'skills'), 'user')))

  await forEachPluginRoot(async (pluginRoot, pluginName) => {
    const skillsDir = path.join(pluginRoot, 'skills')
    entries.push(...(await scanSkillsDir(skillsDir, 'plugin', pluginName)))
  })

  return entries
}
