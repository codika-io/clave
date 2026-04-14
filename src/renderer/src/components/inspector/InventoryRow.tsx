import type { InventoryEntry } from '../../../../shared/inventory-types'

interface InventoryRowProps {
  entry: InventoryEntry
}

export function InventoryRow({ entry }: InventoryRowProps) {
  return (
    <div className="flex items-start justify-between gap-2 px-3 py-1.5 hover:bg-surface-100 transition-colors">
      <div className="flex-1 min-w-0">
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
      <div className="text-[11px] tabular-nums text-text-secondary shrink-0">
        {entry.estimatedTokens.toLocaleString()} tok
      </div>
    </div>
  )
}
