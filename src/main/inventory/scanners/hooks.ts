// src/main/inventory/scanners/hooks.ts
import * as path from 'path'
import * as os from 'os'
import { estimateTokens } from '../token-estimator'
import { forEachPluginRoot, readJson, walkUpFromCwd } from '../scan-utils'
import type { InventoryEntry, InventorySource } from '../../../shared/inventory-types'

interface HookSpec {
  matcher?: string
  hooks?: Array<{ type?: string; command?: string }>
}

function extractHookEntries(
  raw: unknown,
  filePath: string,
  source: InventorySource,
  pluginName: string | undefined,
  out: InventoryEntry[]
): void {
  if (typeof raw !== 'object' || raw === null) return
  const hooks = (raw as Record<string, unknown>).hooks
  if (typeof hooks !== 'object' || hooks === null) return
  for (const [event, specs] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(specs)) continue
    for (const spec of specs as HookSpec[]) {
      const matcher = spec.matcher ?? '*'
      const commands = spec.hooks?.map((h) => h.command ?? '').join(' | ') ?? ''
      out.push({
        id: `hook:${filePath}:${event}:${matcher}`,
        category: 'hooks',
        name: `${event} ${matcher}`,
        source,
        pluginName,
        filePath,
        description: commands,
        estimatedTokens: estimateTokens(`${event} ${matcher} ${commands}`)
      })
    }
  }
}

export async function scanHooks(cwd: string): Promise<InventoryEntry[]> {
  const home = os.homedir()
  const out: InventoryEntry[] = []

  const userSettingsPath = path.join(home, '.claude', 'settings.json')
  const userSettings = await readJson(userSettingsPath)
  if (userSettings) extractHookEntries(userSettings, userSettingsPath, 'user', undefined, out)

  await walkUpFromCwd(cwd, async (dir) => {
    const projectSettings = path.join(dir, '.claude', 'settings.json')
    const parsed = await readJson(projectSettings)
    if (parsed) extractHookEntries(parsed, projectSettings, 'project', undefined, out)
  })

  await forEachPluginRoot(async (pluginRoot, pluginName) => {
    const hooksFile = path.join(pluginRoot, 'hooks', 'hooks.json')
    const parsed = await readJson(hooksFile)
    if (parsed) extractHookEntries(parsed, hooksFile, 'plugin', pluginName, out)
  })

  return out
}
