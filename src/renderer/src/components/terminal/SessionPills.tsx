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

const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

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

/**
 * Wifi-style reasoning-effort indicator: five vertical bars, filled from left
 * up to the active level (1 = low, 5 = max).
 */
function EffortBars({ level }: { level: EffortLevel }): React.ReactElement {
  const active = EFFORT_LEVELS.indexOf(level) + 1
  const bars = [0.3, 0.45, 0.6, 0.8, 1]
  return (
    <svg width="11" height="10" viewBox="0 0 11 10" fill="none" aria-hidden="true">
      {bars.map((h, i) => {
        const x = i * 2
        const barHeight = h * 10
        const y = 10 - barHeight
        const isActive = i < active
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width="1.4"
            height={barHeight}
            rx="0.4"
            fill={isActive ? 'currentColor' : 'transparent'}
            stroke="currentColor"
            strokeWidth={isActive ? 0 : 0.6}
            opacity={isActive ? 1 : 0.35}
          />
        )
      })}
    </svg>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `${n}`
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
        {effort && (
          <Row label="Reasoning">
            <EffortBars level={effort} />
            <span>{EFFORT_LABELS[effort]}</span>
          </Row>
        )}
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
  const ctx = status.context_window
  const maxWindow = effectiveMaxWindow(status)
  const currentUsage = ctx?.current_usage ?? null
  // Compute percentage against the *real* max, not CC's effective window —
  // otherwise the percentage jumps when crossing 200k on 1M-capable models.
  const usedPercent = currentUsage != null && maxWindow ? (currentUsage / maxWindow) * 100 : null

  const modelTrigger = modelLabel ? (
    <button
      type="button"
      className="pill hover:bg-surface-200 focus:outline-none focus-visible:bg-surface-200"
      title="Session details"
    >
      <CpuChipIcon className="w-3 h-3" />
      <span>{modelLabel}</span>
    </button>
  ) : null

  return (
    <>
      {modelTrigger &&
        (isVisible ? (
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
        ) : (
          modelTrigger
        ))}
      {maxWindow != null && (
        <span
          className="pill"
          title={
            currentUsage != null
              ? `Context: ${currentUsage.toLocaleString()} / ${maxWindow.toLocaleString()} tokens` +
                (usedPercent != null ? ` (${usedPercent.toFixed(1)}%)` : '')
              : `Context window: ${maxWindow.toLocaleString()} tokens`
          }
        >
          <span className="tabular-nums">
            {currentUsage != null
              ? `${formatTokens(currentUsage)} / ${formatContextSize(maxWindow)}`
              : formatContextSize(maxWindow)}
          </span>
        </span>
      )}
    </>
  )
}
