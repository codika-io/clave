import { useMemo, useState } from 'react'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'
import { InventoryRow } from './InventoryRow'
import { CATEGORY_COLORS } from './category-colors'
import type { InventoryEntry, InventoryCategory } from '../../../../shared/inventory-types'

const LABELS: Record<InventoryCategory, string> = {
  'claude-md': 'CLAUDE.md',
  memory: 'Memory',
  skills: 'Skills',
  plugins: 'Plugins',
  commands: 'Commands',
  agents: 'Agents',
  mcp: 'MCP Servers',
  hooks: 'Hooks'
}

interface CategorySectionProps {
  category: InventoryCategory
  entries: InventoryEntry[]
  defaultOpen?: boolean
}

export function CategorySection({ category, entries, defaultOpen }: CategorySectionProps) {
  const [open, setOpen] = useState(Boolean(defaultOpen))

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.estimatedTokens - a.estimatedTokens),
    [entries]
  )
  const total = useMemo(
    () => entries.reduce((sum, e) => sum + e.estimatedTokens, 0),
    [entries]
  )
  const maxTokens = sorted[0]?.estimatedTokens ?? 0

  if (entries.length === 0) return null

  const color = CATEGORY_COLORS[category]

  return (
    <div className="border-b border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-200 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ChevronRightIcon
            className={cn('w-3 h-3 transition-transform', open && 'rotate-90')}
          />
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-semibold text-text-primary">{LABELS[category]}</span>
          <span className="text-[10px] text-text-secondary">({entries.length})</span>
        </div>
        <span className="text-[11px] tabular-nums text-text-secondary">
          {total.toLocaleString()} tok
        </span>
      </button>
      {open && (
        <div>
          {sorted.map((e) => (
            <InventoryRow key={e.id} entry={e} maxTokens={maxTokens} color={color} />
          ))}
        </div>
      )}
    </div>
  )
}
