// src/main/inventory/scanners/mcp.ts
import * as path from 'path'
import * as os from 'os'
import { estimateTokens } from '../token-estimator'
import { forEachPluginRoot, readJson, walkUpFromCwd } from '../scan-utils'
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

export async function scanMcp(cwd: string): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const out: InventoryEntry[] = []

  // Project .mcp.json walking up from CWD
  await walkUpFromCwd(cwd, async (dir) => {
    const projectMcp = path.join(dir, '.mcp.json')
    const parsed = await readJson(projectMcp)
    if (parsed) addServersFromJson(parsed, projectMcp, 'project', undefined, out)
  })

  // Global user settings
  const userSettingsPath = path.join(home, '.claude', 'settings.json')
  const userSettings = await readJson(userSettingsPath)
  if (userSettings) addServersFromJson(userSettings, userSettingsPath, 'user', undefined, out)

  // Plugin .mcp.json files
  await forEachPluginRoot(async (pluginRoot, pluginName) => {
    const mcpFile = path.join(pluginRoot, '.mcp.json')
    const parsed = await readJson(mcpFile)
    if (parsed) addServersFromJson(parsed, mcpFile, 'plugin', pluginName, out)
  })

  return out
}
