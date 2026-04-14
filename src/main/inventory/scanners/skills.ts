// src/main/inventory/scanners/skills.ts
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import type { InventoryEntry } from '../../../shared/inventory-types'

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

async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name))
  } catch {
    return []
  }
}

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

  const pluginCache = path.join(home, '.claude', 'plugins', 'cache')
  const marketplaces = await listDirs(pluginCache)
  for (const marketplace of marketplaces) {
    const plugins = await listDirs(marketplace)
    for (const plugin of plugins) {
      // Each plugin is typically versioned: plugins/cache/<marketplace>/<plugin>/<version>/skills
      const versions = await listDirs(plugin)
      const candidateRoots = versions.length > 0 ? versions : [plugin]
      for (const versionDir of candidateRoots) {
        const skillsDir = path.join(versionDir, 'skills')
        entries.push(...(await scanSkillsDir(skillsDir, 'plugin', path.basename(plugin))))
      }
    }
  }
  return entries
}
