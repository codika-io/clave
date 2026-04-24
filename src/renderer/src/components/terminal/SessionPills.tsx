import type React from 'react'
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
 * Pretty model name. CC uses either a family label (e.g. "Opus 4.7") or a full
 * id like "claude-opus-4-7" / "claude-sonnet-4-6". When a `display_name` is
 * provided we trust it; otherwise derive something reasonable from the id.
 */
function formatModelLabel(model: ClaudeSessionStatus['model']): string | null {
  if (!model) return null
  if (model.display_name) return model.display_name
  const id = model.id
  if (!id) return null
  // claude-opus-4-7 → Opus 4.7 (strip any trailing [...] tag like [1m])
  const stripped = id.replace(/\[[^\]]*\]$/, '')
  const match = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)$/i.exec(stripped)
  if (match) {
    const family = match[1][0].toUpperCase() + match[1].slice(1)
    return `${family} ${match[2]}.${match[3]}`
  }
  return stripped
}

/**
 * Wifi-style reasoning-effort indicator: five vertical bars, filled from left
 * up to the active level (1 = low, 5 = max). Inactive bars stay as a muted
 * outline so the shape still reads as a "5-bar meter".
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
  if (size >= 1000) return `${Math.round(size / 1000)}k`
  return `${size}`
}

export function SessionPills({ sessionId }: SessionPillsProps): React.ReactElement | null {
  const status = useSessionStore((s) => s.sessionStatuses[sessionId])
  if (!status) return null

  const modelLabel = formatModelLabel(status.model)
  const effort = status.effort?.level
  const ctx = status.context_window
  const extended = status.exceeds_200k_tokens || (ctx && ctx.context_window_size > 200_000)

  return (
    <>
      {modelLabel && (
        <span
          className="pill"
          title={status.model?.id ? `Model: ${status.model.id}` : 'Current model'}
        >
          {modelLabel}
        </span>
      )}
      {effort && (
        <span
          className="pill"
          title={`Reasoning effort: ${EFFORT_LABELS[effort] ?? effort}`}
        >
          <EffortBars level={effort} />
          <span>{EFFORT_LABELS[effort] ?? effort}</span>
        </span>
      )}
      {ctx && (
        <span
          className="pill"
          title={
            ctx.current_usage != null
              ? `Context: ${ctx.current_usage.toLocaleString()} / ${ctx.context_window_size.toLocaleString()} tokens` +
                (ctx.used_percentage != null ? ` (${ctx.used_percentage.toFixed(1)}%)` : '') +
                (extended ? ' — extended context' : '')
              : `Context window: ${ctx.context_window_size.toLocaleString()} tokens` +
                (extended ? ' — extended context' : '')
          }
        >
          <span className="tabular-nums">
            {ctx.current_usage != null
              ? `${formatTokens(ctx.current_usage)} / ${formatContextSize(ctx.context_window_size)}`
              : formatContextSize(ctx.context_window_size)}
          </span>
          {extended && (
            <span className="pill-muted" style={{ fontSize: 9, fontWeight: 600 }}>
              1M
            </span>
          )}
        </span>
      )}
    </>
  )
}
