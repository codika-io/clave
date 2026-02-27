import { useCallback, useEffect, useState, useMemo } from 'react'
import type { UsageData, RateLimits } from '../../../../preload/index.d'

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function formatCost(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K'
  return '$' + n.toFixed(2)
}

function getModelDisplayName(model: string): string {
  if (model.includes('opus-4-6')) return 'Opus 4.6'
  if (model.includes('opus-4-5')) return 'Opus 4.5'
  if (model.includes('sonnet-4-5')) return 'Sonnet 4.5'
  if (model.includes('haiku-4-5')) return 'Haiku 4.5'
  return model.split('-').slice(1, -1).join(' ')
}

const MODEL_COLORS: Record<string, string> = {
  opus: 'var(--color-accent)',
  sonnet: 'var(--color-status-working)',
  haiku: 'var(--color-status-waiting)'
}

function getModelColor(model: string): string {
  if (model.includes('opus')) return MODEL_COLORS.opus
  if (model.includes('sonnet')) return MODEL_COLORS.sonnet
  if (model.includes('haiku')) return MODEL_COLORS.haiku
  return 'var(--color-text-tertiary)'
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface-100 border border-border-subtle rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-text-tertiary font-medium">{label}</span>
      <span className="text-xl font-semibold text-text-primary">{value}</span>
      <span className="text-[11px] text-text-tertiary">{sub}</span>
    </div>
  )
}

function RateLimitBar({ label, percent, resetInfo }: { label: string; percent: number; resetInfo: string }) {
  const barColor = percent >= 80
    ? 'var(--color-status-waiting)'
    : 'var(--color-accent)'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-text-primary">{label}</span>
        {resetInfo && (
          <span className="text-[11px] text-text-tertiary">{resetInfo}</span>
        )}
      </div>
      <div className="h-2.5 bg-surface-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(percent, 1)}%`,
            backgroundColor: barColor,
            transition: 'width 0.3s ease'
          }}
        />
      </div>
      <span className="text-[11px] text-text-tertiary">{percent}% used</span>
    </div>
  )
}

function RateLimitsSection({ rateLimits, onRefresh, loading }: {
  rateLimits: RateLimits | null
  onRefresh: () => void
  loading: boolean
}) {
  if (!rateLimits) {
    return (
      <div className="bg-surface-100 border border-border-subtle rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-text-secondary">Plan limits</span>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-[11px] text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? 'Fetching...' : 'Load'}
          </button>
        </div>
        <p className="text-[11px] text-text-tertiary">
          Click Load to fetch rate limit data from Claude Code.
        </p>
      </div>
    )
  }

  const age = Date.now() - rateLimits.fetchedAt
  const ageMinutes = Math.floor(age / 60000)
  const ageLabel = ageMinutes < 1 ? 'just now' : `${ageMinutes}m ago`

  return (
    <div className="bg-surface-100 border border-border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-text-secondary">Plan limits</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-tertiary">{ageLabel}</span>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 rounded-md hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title="Refresh limits"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className={loading ? 'animate-spin' : ''}>
              <path
                d="M12 7A5 5 0 1 1 7 2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M7 0.5L9.5 2L7 3.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {rateLimits.entries.map((entry, i) => (
          <RateLimitBar
            key={i}
            label={entry.label}
            percent={entry.percent}
            resetInfo={entry.resetInfo}
          />
        ))}
      </div>
    </div>
  )
}

function ActivityChart({ data }: { data: UsageData }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const last30 = useMemo(() => {
    const now = new Date()
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return data.dailyActivity
      .filter((d) => d.date >= cutoffStr)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [data.dailyActivity])

  if (last30.length === 0) return null

  const maxMessages = Math.max(...last30.map((d) => d.messageCount), 1)
  const chartWidth = 600
  const chartHeight = 160
  const barWidth = Math.max(4, Math.floor((chartWidth - 40) / last30.length) - 2)
  const barGap = 2

  return (
    <div className="bg-surface-100 border border-border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-text-secondary">Activity (last 30 days)</span>
        {hoveredIdx !== null && last30[hoveredIdx] && (
          <span className="text-[11px] text-text-tertiary">
            {last30[hoveredIdx].date}: {last30[hoveredIdx].messageCount.toLocaleString()} messages
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        style={{ maxHeight: 180 }}
      >
        <text x="0" y="12" className="fill-[var(--text-tertiary)]" fontSize="9" fontFamily="var(--font-sans)">
          {formatNumber(maxMessages)}
        </text>
        <text x="0" y={chartHeight - 2} className="fill-[var(--text-tertiary)]" fontSize="9" fontFamily="var(--font-sans)">
          0
        </text>
        {last30.map((day, i) => {
          const barHeight = (day.messageCount / maxMessages) * (chartHeight - 24)
          const x = 36 + i * (barWidth + barGap)
          const y = chartHeight - 12 - barHeight
          const isHovered = hoveredIdx === i
          return (
            <g key={day.date}>
              <rect
                x={x - 1}
                y={0}
                width={barWidth + 2}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={2}
                fill="var(--color-accent)"
                opacity={isHovered ? 1 : 0.7}
                style={{ transition: 'opacity 0.15s', pointerEvents: 'none' }}
              />
              {(i % Math.ceil(last30.length / 6) === 0 || i === last30.length - 1) && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight}
                  textAnchor="middle"
                  className="fill-[var(--text-tertiary)]"
                  fontSize="8"
                  fontFamily="var(--font-sans)"
                >
                  {day.date.slice(5)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ModelBreakdown({ data }: { data: UsageData }) {
  const models = useMemo(() => {
    return Object.entries(data.modelUsage)
      .map(([model, usage]) => ({
        model,
        name: getModelDisplayName(model),
        color: getModelColor(model),
        total:
          usage.inputTokens +
          usage.outputTokens +
          usage.cacheReadInputTokens +
          usage.cacheCreationInputTokens
      }))
      .sort((a, b) => b.total - a.total)
  }, [data.modelUsage])

  if (models.length === 0) return null

  const maxTokens = Math.max(...models.map((m) => m.total), 1)

  return (
    <div className="bg-surface-100 border border-border-subtle rounded-xl p-4">
      <span className="text-xs font-medium text-text-secondary">Model breakdown</span>
      <div className="mt-3 space-y-3">
        {models.map((m) => (
          <div key={m.model}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-primary font-medium">{m.name}</span>
              <span className="text-[11px] text-text-tertiary">{formatNumber(m.total)} tokens</span>
            </div>
            <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(m.total / maxTokens) * 100}%`,
                  backgroundColor: m.color,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HourGrid({ hourCounts }: { hourCounts: Record<string, number> }) {
  const maxCount = useMemo(() => {
    const values = Object.values(hourCounts)
    return values.length > 0 ? Math.max(...values, 1) : 1
  }, [hourCounts])

  return (
    <div className="bg-surface-100 border border-border-subtle rounded-xl p-4">
      <span className="text-xs font-medium text-text-secondary">Activity by hour</span>
      <div className="mt-3 grid grid-cols-12 gap-1">
        {Array.from({ length: 24 }, (_, h) => {
          const count = hourCounts[String(h)] ?? 0
          const intensity = count / maxCount
          return (
            <div key={h} className="flex flex-col items-center gap-1">
              <div
                className="w-full aspect-square rounded-sm"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  opacity: Math.max(0.08, intensity * 0.9),
                  transition: 'opacity 0.2s'
                }}
                title={`${h}:00 — ${count.toLocaleString()} messages`}
              />
              {h % 3 === 0 && (
                <span className="text-[8px] text-text-tertiary">{h}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rateLimits, setRateLimits] = useState<RateLimits | null>(null)
  const [rateLimitsLoading, setRateLimitsLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (!window.electronAPI?.getUsageStats) {
        setError('Usage stats not available outside Electron')
        return
      }
      const stats = await window.electronAPI.getUsageStats()
      setData(stats)
      if (stats.rateLimits) {
        setRateLimits(stats.rateLimits)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRateLimits = useCallback(async () => {
    if (!window.electronAPI?.fetchRateLimits) return
    setRateLimitsLoading(true)
    try {
      const result = await window.electronAPI.fetchRateLimits()
      if (result) {
        setRateLimits(result)
      }
    } catch (err) {
      console.error('Failed to fetch rate limits:', err)
    } finally {
      setRateLimitsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-text-tertiary">Loading usage data...</span>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <span className="text-sm text-text-tertiary">{error}</span>
        <button
          onClick={fetchData}
          className="text-xs text-accent hover:text-accent-hover transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex-1 overflow-y-auto bg-surface-50">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Usage</h2>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={loading ? 'animate-spin' : ''}>
              <path
                d="M12 7A5 5 0 1 1 7 2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M7 0.5L9.5 2L7 3.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Rate limits */}
        <RateLimitsSection
          rateLimits={rateLimits}
          onRefresh={fetchRateLimits}
          loading={rateLimitsLoading}
        />

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Est. Cost"
            value={formatCost(data.estimatedCost)}
            sub="all time"
          />
          <StatCard
            label="Tokens"
            value={formatNumber(data.totalTokens)}
            sub="all time"
          />
          <StatCard
            label="Sessions"
            value={data.totalSessions.toLocaleString()}
            sub="total"
          />
          <StatCard
            label="Messages"
            value={formatNumber(data.totalMessages)}
            sub="total"
          />
        </div>

        {/* Activity chart */}
        <ActivityChart data={data} />

        {/* Bottom row: model breakdown + hour grid */}
        <div className="grid grid-cols-2 gap-3">
          <ModelBreakdown data={data} />
          <HourGrid hourCounts={data.hourCounts} />
        </div>
      </div>
    </div>
  )
}
