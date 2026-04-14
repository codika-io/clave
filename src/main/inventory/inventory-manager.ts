// src/main/inventory/inventory-manager.ts
import type { InventoryReport, InventoryEntry } from '../../shared/inventory-types'
import { scanClaudeMd } from './scanners/claude-md'
import { scanSkills } from './scanners/skills'
import { scanPlugins } from './scanners/plugins'
import { scanMcp } from './scanners/mcp'
import { scanHooks } from './scanners/hooks'
import { scanMemory } from './scanners/memory'
import { scanCommands } from './scanners/commands'
import { scanAgents } from './scanners/agents'
import { contextWindowFor } from './token-estimator'

interface CacheSlot {
  report: InventoryReport
  expiresAt: number
}

const TTL_MS = 30_000

class InventoryManager {
  private cache = new Map<string, CacheSlot>()

  async getReport(cwd: string, model?: string): Promise<InventoryReport> {
    const key = `${cwd}::${model ?? ''}`
    const now = Date.now()
    const slot = this.cache.get(key)
    if (slot && slot.expiresAt > now) return slot.report

    const warnings: string[] = []
    const results = await Promise.allSettled([
      scanClaudeMd(cwd),
      scanSkills(),
      scanPlugins(),
      scanMcp(cwd),
      scanHooks(cwd),
      scanMemory(cwd),
      scanCommands(),
      scanAgents()
    ])

    const entries: InventoryEntry[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') entries.push(...result.value)
      else warnings.push(result.reason?.message ?? 'scanner failed')
    }

    const totalTokens = entries.reduce((sum, e) => sum + e.estimatedTokens, 0)
    const report: InventoryReport = {
      cwd,
      model,
      contextWindow: contextWindowFor(model),
      totalTokens,
      entries,
      generatedAt: now,
      warnings
    }
    this.cache.set(key, { report, expiresAt: now + TTL_MS })
    return report
  }

  invalidate(): void {
    this.cache.clear()
  }
}

export const inventoryManager = new InventoryManager()
