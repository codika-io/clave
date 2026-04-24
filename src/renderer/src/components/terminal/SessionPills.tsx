import type React from 'react'
import { useState } from 'react'
import { CpuChipIcon } from '@heroicons/react/24/outline'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { useSessionStore } from '../../store/session-store'
import type { ClaudeSessionStatus } from '../../../../preload/index.d'

interface SessionPillsProps {
  sessionId: string
}

type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max'
}

/**
 * Pretty model name. CC's `display_name` often suffixes variant metadata like
 * "Opus 4.7 (1M context)" — the context window has its own pill, so we strip
 * any trailing parenthetical.
 */
function formatModelLabel(model: ClaudeSessionStatus['model']): string | null {
  if (!model) return null
  if (model.display_name) {
    return model.display_name.replace(/\s*\([^)]*\)\s*$/, '').trim() || model.display_name
  }
  const id = model.id
  if (!id) return null
  // claude-opus-4-7[1m] → Opus 4.7
  const stripped = id.replace(/\[[^\]]*\]$/, '')
  const match = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)$/i.exec(stripped)
  if (match) {
    const family = match[1][0].toUpperCase() + match[1].slice(1)
    return `${family} ${match[2]}.${match[3]}`
  }
  return stripped
}

/**
 * Derive the real max context window.
 *
 * CC's `context_window.context_window_size` reflects the *effective* window:
 * on a 1M-capable model, it reports 200k until you cross that threshold, and
 * 1_000_000 afterwards. For a stable display we want the ceiling — detect the
 * `[1m]` tag on `model.id` and trust that as ground truth; otherwise fall
 * back to CC's reported size (which matches reality on 200k-only models).
 */
function effectiveMaxWindow(status: ClaudeSessionStatus): number | null {
  const id = status.model?.id ?? ''
  if (/\[1m\]$/i.test(id)) return 1_000_000
  return status.context_window?.context_window_size ?? null
}

function formatContextSize(size: number): string {
  if (size >= 1_000_000) return `${Math.round(size / 1_000_000)}M`
  if (size >= 1_000) return `${Math.round(size / 1_000)}k`
  return `${size}`
}

function formatCost(usd: number | undefined): string {
  if (usd == null || usd === 0) return '$0.00'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

interface RowProps {
  label: string
  children: React.ReactNode
}
function Row({ label, children }: RowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-1.5 text-[11px]">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary flex items-center gap-1.5 tabular-nums">{children}</span>
    </div>
  )
}

interface ModelDetailsProps {
  status: ClaudeSessionStatus
}
function ModelDetails({ status }: ModelDetailsProps): React.ReactElement {
  const effort = status.effort?.level
  const cost = status.cost?.total_cost_usd
  const maxWindow = effectiveMaxWindow(status)
  return (
    <div className="w-[260px] py-1">
      <div className="px-3 py-2 border-b border-border-subtle">
        <div className="text-xs font-semibold text-text-primary">
          {formatModelLabel(status.model) ?? '—'}
        </div>
        {status.model?.id && (
          <div className="text-[10px] text-text-tertiary font-mono mt-0.5 break-all">
            {status.model.id}
          </div>
        )}
      </div>
      <div className="py-0.5">
        {effort && <Row label="Reasoning">{EFFORT_LABELS[effort]}</Row>}
        <Row label="Thinking">
          <span className={status.thinking?.enabled ? 'text-text-primary' : 'pill-muted'}>
            {status.thinking?.enabled ? 'On' : 'Off'}
          </span>
        </Row>
        <Row label="Fast mode">
          <span className={status.fast_mode ? 'text-text-primary' : 'pill-muted'}>
            {status.fast_mode ? 'On' : 'Off'}
          </span>
        </Row>
        {maxWindow != null && (
          <Row label="Context window">{formatContextSize(maxWindow)} tokens</Row>
        )}
        {status.output_style?.name && (
          <Row label="Output style">{status.output_style.name}</Row>
        )}
        {status.agent?.name && <Row label="Agent">{status.agent.name}</Row>}
        <Row label="Session cost">{formatCost(cost)}</Row>
      </div>
    </div>
  )
}

export function SessionPills({ sessionId }: SessionPillsProps): React.ReactElement | null {
  const status = useSessionStore((s) => s.sessionStatuses[sessionId])
  const isVisible = useSessionStore((s) => s.selectedSessionIds.includes(sessionId))
  const [open, setOpen] = useState(false)
  if (!status) return null

  const modelLabel = formatModelLabel(status.model)
  if (!modelLabel) return null

  // Match the InventoryButton shape/hover so the header reads as a consistent
  // row of clickable chips rather than a mix of pill + icon button.
  const modelTrigger = (
    <button
      type="button"
      className="btn-icon btn-icon-sm hover:bg-surface-300 relative gap-1 px-1.5"
      title="Session details"
    >
      <CpuChipIcon className="w-3.5 h-3.5" />
      <span className="text-[11px] font-medium leading-none">{modelLabel}</span>
    </button>
  )

  if (!isVisible) return modelTrigger

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{modelTrigger}</PopoverTrigger>
      <PopoverContent
        animated
        open={open}
        side="bottom"
        align="end"
        sideOffset={8}
        className="p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <ModelDetails status={status} />
      </PopoverContent>
    </Popover>
  )
}
