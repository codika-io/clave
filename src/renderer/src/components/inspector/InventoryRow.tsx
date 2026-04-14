import type { InventoryEntry } from '../../../../shared/inventory-types'

interface InventoryRowProps {
  entry: InventoryEntry
  maxTokens: number
  color: string
}

export function InventoryRow({ entry, maxTokens, color }: InventoryRowProps) {
  const fillPercent = maxTokens > 0 ? (entry.estimatedTokens / maxTokens) * 100 : 0

  return (
    <div className="relative flex items-start justify-between gap-2 px-3 py-1.5 hover:bg-surface-100 transition-colors">
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 pointer-events-none"
        style={{
          width: `${fillPercent}%`,
          backgroundColor: color,
          opacity: 0.08
        }}
      />
      <div className="relative flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">
          {entry.name}
          {entry.pluginName && entry.category !== 'plugins' && (
            <span className="ml-1 text-[10px] text-text-secondary">@{entry.pluginName}</span>
          )}
        </div>
        {entry.description && (
          <div className="text-[11px] text-text-secondary truncate">{entry.description}</div>
        )}
        {entry.notes && (
          <div className="text-[10px] text-text-secondary italic truncate">{entry.notes}</div>
        )}
      </div>
      <div className="relative text-[11px] tabular-nums text-text-secondary shrink-0">
        {entry.estimatedTokens.toLocaleString()} tok
      </div>
    </div>
  )
}
