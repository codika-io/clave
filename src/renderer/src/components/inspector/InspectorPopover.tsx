import { useEffect, useMemo } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { CategorySection } from './CategorySection'
import { useInventoryStore } from '../../store/inventory-store'
import type { InventoryCategory, InventoryEntry } from '../../../../shared/inventory-types'

const ORDER: InventoryCategory[] = [
  'claude-md',
  'mcp',
  'memory',
  'hooks',
  'plugins',
  'skills',
  'commands',
  'agents'
]

interface InspectorPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cwd: string
  model?: string
  children: React.ReactNode
}

export function InspectorPopover({ open, onOpenChange, cwd, model, children }: InspectorPopoverProps) {
  const fetch = useInventoryStore((s) => s.fetch)
  const report = useInventoryStore((s) => s.reports[`${cwd}::${model ?? ''}`])
  const loading = useInventoryStore((s) => s.loading[`${cwd}::${model ?? ''}`] ?? false)

  useEffect(() => {
    if (open) fetch(cwd, model)
  }, [open, cwd, model, fetch])

  const byCategory = useMemo(() => {
    const map: Record<InventoryCategory, InventoryEntry[]> = {
      'claude-md': [],
      memory: [],
      skills: [],
      plugins: [],
      commands: [],
      agents: [],
      mcp: [],
      hooks: []
    }
    for (const entry of report?.entries ?? []) map[entry.category].push(entry)
    return map
  }, [report])

  const percent = report
    ? Math.min(100, Math.round((report.totalTokens / report.contextWindow) * 100))
    : 0

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        animated
        open={open}
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-[420px] max-h-[500px] flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-text-primary">Context Inventory</span>
            <span className="text-[11px] text-text-secondary tabular-nums">
              {report
                ? `${report.totalTokens.toLocaleString()} / ${report.contextWindow.toLocaleString()} tok · ${percent}%`
                : loading
                  ? 'Scanning…'
                  : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fetch(cwd, model, true)}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={loading}
              className="btn-icon btn-icon-xs"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="btn-icon btn-icon-xs"
              title="Close"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {ORDER.map((category) => (
            <CategorySection
              key={category}
              category={category}
              entries={byCategory[category]}
              defaultOpen={category === 'claude-md' || category === 'mcp'}
            />
          ))}
          {report?.warnings.length ? (
            <div className="px-3 py-2 text-[10px] text-status-waiting border-t border-border-subtle border-l-2 border-l-status-waiting">
              {report.warnings.join(' · ')}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
