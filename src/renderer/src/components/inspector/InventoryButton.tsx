import { useState, useEffect } from 'react'
import { CircleStackIcon } from '@heroicons/react/24/outline'
import { contextPercent, inventoryKey, useInventoryStore } from '../../store/inventory-store'
import { InspectorPopover } from './InspectorPopover'
import { cn } from '../../lib/utils'

interface InventoryButtonProps {
  cwd: string
  model?: string
}

function badgeColorFor(percent: number): string | null {
  if (percent >= 70) return 'bg-status-waiting text-white'
  if (percent >= 40) return 'bg-status-ready text-white'
  return null
}

export function InventoryButton({ cwd, model }: InventoryButtonProps) {
  const [open, setOpen] = useState(false)
  const fetch = useInventoryStore((s) => s.fetch)
  const report = useInventoryStore((s) => s.reports[inventoryKey(cwd, model)])

  useEffect(() => {
    fetch(cwd, model)
  }, [cwd, model, fetch])

  const percent = contextPercent(report)
  const badgeColor = percent !== null ? badgeColorFor(percent) : null

  return (
    <InspectorPopover open={open} onOpenChange={setOpen} cwd={cwd} model={model}>
      <button
        className="btn-icon btn-icon-sm hover:bg-surface-300 relative"
        title={
          report
            ? `Context inventory: ${report.totalTokens.toLocaleString()} tok (${percent}%)`
            : 'Context inventory'
        }
      >
        <CircleStackIcon className="w-3.5 h-3.5" />
        {percent !== null && badgeColor && (
          <span
            className={cn(
              'absolute -top-1 -right-1 text-[9px] font-semibold leading-none rounded-full px-1 py-0.5 tabular-nums',
              badgeColor
            )}
          >
            {percent}%
          </span>
        )}
      </button>
    </InspectorPopover>
  )
}
