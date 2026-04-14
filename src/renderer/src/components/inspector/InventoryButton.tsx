import { useState, useEffect } from 'react'
import { CircleStackIcon } from '@heroicons/react/24/outline'
import { contextPercent, inventoryKey, useInventoryStore } from '../../store/inventory-store'
import { useSessionStore } from '../../store/session-store'
import { InspectorPopover } from './InspectorPopover'
import { cn } from '../../lib/utils'

interface InventoryButtonProps {
  sessionId: string
  cwd: string
  model?: string
}

function badgeStylesFor(percent: number): string {
  if (percent >= 70) return 'bg-red-500 text-white'
  if (percent >= 40) return 'bg-status-waiting text-white'
  return 'bg-surface-300 text-text-secondary'
}

export function InventoryButton({ sessionId, cwd, model }: InventoryButtonProps) {
  const [open, setOpen] = useState(false)
  const fetch = useInventoryStore((s) => s.fetch)
  const report = useInventoryStore((s) => s.reports[inventoryKey(cwd, model)])
  const isVisible = useSessionStore((s) => s.selectedSessionIds.includes(sessionId))

  useEffect(() => {
    fetch(cwd, model)
  }, [cwd, model, fetch])

  // Auto-close when the owning session is hidden (display:none keeps this mounted
  // but detaches the trigger, which would otherwise leave the popover floating at 0,0).
  useEffect(() => {
    if (!isVisible && open) setOpen(false)
  }, [isVisible, open])

  const percent = contextPercent(report)

  return (
    <InspectorPopover open={open} onOpenChange={setOpen} cwd={cwd} model={model}>
      <button
        className="btn-icon btn-icon-sm hover:bg-surface-300 relative gap-1 px-1.5"
        title={
          report
            ? `Context inventory: ${report.totalTokens.toLocaleString()} tok (${percent}%)`
            : 'Context inventory'
        }
      >
        <CircleStackIcon className="w-3.5 h-3.5" />
        {percent !== null && (
          <span
            className={cn(
              'text-[10px] font-semibold leading-none rounded-full px-1.5 py-0.5 tabular-nums',
              badgeStylesFor(percent)
            )}
          >
            {percent}%
          </span>
        )}
      </button>
    </InspectorPopover>
  )
}
