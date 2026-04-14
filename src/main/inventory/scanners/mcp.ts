// src/main/inventory/scanners/mcp.ts
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { contentCache } from '../content-cache'
import { estimateTokens } from '../token-estimator'
import type { InventoryEntry, InventorySource } from '../../../shared/inventory-types'

function addServersFromJson(
  json: unknown,
  filePath: string,
  source: InventorySource,
  pluginName: string | undefined,
  out: InventoryEntry[]
): void {
  if (typeof json !== 'object' || json === null) return
  const servers = (json as Record<string, unknown>).mcpServers ?? json
  if (typeof servers !== 'object' || servers === null) return
  for (const [name, config] of Object.entries(servers as Record<string, unknown>)) {
    const configJson = JSON.stringify(config)
    out.push({
      id: `mcp:${filePath}:${name}`,
      category: 'mcp',
      name,
      source,
      pluginName,
      filePath,
      estimatedTokens: estimateTokens(configJson),
      notes: 'Config size only; runtime tool schemas not measured'
    })
  }
}

async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name))
  } catch {
    return []
  }
}

async function readJson(filePath: string): Promise<unknown | null> {
  const content = await contentCache.readIfChanged(filePath)
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function scanMcp(cwd: string): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const out: InventoryEntry[] = []

  // Project .mcp.json walking up from CWD
  let current = path.resolve(cwd)
  const visited = new Set<string>()
  while (!visited.has(current)) {
    visited.add(current)
    const projectMcp = path.join(current, '.mcp.json')
    const parsed = await readJson(projectMcp)
    if (parsed) addServersFromJson(parsed, projectMcp, 'project', undefined, out)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  // Global user settings
  const userSettings = await readJson(path.join(home, '.claude', 'settings.json'))
  if (userSettings)
    addServersFromJson(userSettings, path.join(home, '.claude', 'settings.json'), 'user', undefined, out)

  // Plugin .mcp.json files
  const pluginCache = path.join(home, '.claude', 'plugins', 'cache')
  const marketplaces = await listDirs(pluginCache)
  for (const marketplace of marketplaces) {
    const plugins = await listDirs(marketplace)
    for (const plugin of plugins) {
      const versions = await listDirs(plugin)
      const pluginRoots = versions.length > 0 ? versions : [plugin]
      for (const pluginRoot of pluginRoots) {
        const mcpFile = path.join(pluginRoot, '.mcp.json')
        const parsed = await readJson(mcpFile)
        if (parsed) addServersFromJson(parsed, mcpFile, 'plugin', path.basename(plugin), out)
      }
    }
  }

  return out
}
