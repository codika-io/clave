export type InventoryCategory =
  | 'claude-md'
  | 'memory'
  | 'skills'
  | 'plugins'
  | 'commands'
  | 'agents'
  | 'mcp'
  | 'hooks'

export type InventorySource = 'user' | 'project' | 'plugin' | 'system'

export interface InventoryEntry {
  id: string
  category: InventoryCategory
  name: string
  source: InventorySource
  pluginName?: string
  filePath?: string
  description?: string
  estimatedTokens: number
  notes?: string
}

export interface InventoryReport {
  cwd: string
  model?: string
  contextWindow: number
  totalTokens: number
  entries: InventoryEntry[]
  generatedAt: number
  warnings: string[]
}
