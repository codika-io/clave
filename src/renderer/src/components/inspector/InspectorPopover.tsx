import { useEffect, useMemo, useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip'
import { ArrowPathIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { CategorySection } from './CategorySection'
import { CATEGORY_COLORS } from './category-colors'
import { contextPercent, inventoryKey, useInventoryStore } from '../../store/inventory-store'
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

const MIN_SPINNER_MS = 450

interface InspectorPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cwd: string
  model?: string
  children: React.ReactNode
}

export function InspectorPopover({ open, onOpenChange, cwd, model, children }: InspectorPopoverProps) {
  const key = inventoryKey(cwd, model)
  const fetch = useInventoryStore((s) => s.fetch)
  const report = useInventoryStore((s) => s.reports[key])
  const storeLoading = useInventoryStore((s) => s.loading[key] ?? false)
  const [refreshing, setRefreshing] = useState(false)
  const loading = storeLoading || refreshing

  useEffect(() => {
    if (open) fetch(cwd, model)
  }, [open, cwd, model, fetch])

  const handleRefresh = async () => {
    setRefreshing(true)
    const start = performance.now()
    try {
      await fetch(cwd, model, true)
    } finally {
      const elapsed = performance.now() - start
      const remaining = Math.max(0, MIN_SPINNER_MS - elapsed)
      setTimeout(() => setRefreshing(false), remaining)
    }
  }

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

  const categoryTotals = useMemo(() => {
    return ORDER.map((category) => ({
      category,
      total: byCategory[category].reduce((sum, e) => sum + e.estimatedTokens, 0)
    })).filter((c) => c.total > 0)
  }, [byCategory])

  const percent = contextPercent(report) ?? 0
  const grandTotal = report?.totalTokens ?? 0

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
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="btn-icon btn-icon-xs"
                    aria-label="What is this?"
                  >
                    <InformationCircleIcon className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-[280px] whitespace-normal leading-snug">
                  <div className="space-y-1">
                    <div className="font-semibold">What you're seeing</div>
                    <div className="text-text-secondary">
                      Everything Claude Code loads into context at session start. Token counts are estimates
                      (≈ chars ÷ 4). MCP runtime tool schemas aren't counted.
                    </div>
                    <div className="font-semibold pt-1">Reduce context</div>
                    <ul className="list-disc pl-3.5 space-y-0.5 text-text-secondary">
                      <li><code>/plugin</code> — disable or uninstall plugins</li>
                      <li><code>/clear</code> — wipe the current conversation</li>
                      <li><code>/compact</code> — summarize to shrink context</li>
                      <li>Edit <code>~/.claude/settings.json</code> to turn off skills or MCP servers</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              type="button"
              onClick={handleRefresh}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={loading}
              className="btn-icon btn-icon-xs"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="btn-icon btn-icon-xs"
              title="Close"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {grandTotal > 0 && (
          <div className="px-3 pt-2 pb-2.5 border-b border-border-subtle">
            <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-surface-200">
              {categoryTotals.map(({ category, total }) => (
                <div
                  key={category}
                  style={{
                    width: `${(total / grandTotal) * 100}%`,
                    backgroundColor: CATEGORY_COLORS[category]
                  }}
                  title={`${category}: ${total.toLocaleString()} tok`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1.5 text-[10px] text-text-secondary">
              {categoryTotals.map(({ category, total }) => (
                <span key={category} className="flex items-center gap-1 tabular-nums">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[category] }}
                  />
                  {Math.round((total / grandTotal) * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}
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
