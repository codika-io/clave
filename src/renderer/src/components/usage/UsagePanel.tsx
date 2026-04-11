import { useCallback, useEffect, useState, useMemo } from 'react'
import type { UsageData, DailyCost, HourlyCost } from '../../../../preload/index.d'

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
  if (model.includes('sonnet-4-6')) return 'Sonnet 4.6'
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

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

interface HeatmapDay {
  date: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

function buildHeatmapGrid(dailyActivity: UsageData['dailyActivity']): {
  weeks: HeatmapDay[][]
  monthLabels: { label: string; col: number }[]
  totalMessages: number
} {
  const lookup = new Map<string, number>()
  for (const d of dailyActivity) {
    lookup.set(d.date, d.messageCount)
  }

  // Build 52 weeks ending today (Sunday-aligned weeks like GitHub)
  const today = new Date()
  const todayDay = today.getDay() // 0=Sun
  // End of the grid is today. Start is 52 weeks back, aligned to Sunday.
  const endDate = new Date(today)
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - (52 * 7 + todayDay))

  const days: { date: string; count: number }[] = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10)
    days.push({ date: dateStr, count: lookup.get(dateStr) ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  // Compute percentile thresholds from non-zero days
  const nonZero = days.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b)
  let q1 = 1, q2 = 2, q3 = 3
  if (nonZero.length > 0) {
    q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1
    q2 = nonZero[Math.floor(nonZero.length * 0.5)] || q1 + 1
    q3 = nonZero[Math.floor(nonZero.length * 0.75)] || q2 + 1
  }

  function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0
    if (count <= q1) return 1
    if (count <= q2) return 2
    if (count <= q3) return 3
    return 4
  }

  // Group into weeks (columns). Each week is Sun..Sat (7 rows).
  const weeks: HeatmapDay[][] = []
  let currentWeek: HeatmapDay[] = []
  for (const d of days) {
    const dow = new Date(d.date).getDay()
    if (dow === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    currentWeek.push({ ...d, level: getLevel(d.count) })
  }
  if (currentWeek.length > 0) weeks.push(currentWeek)

  // Build month labels: find the first week where a month starts
  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  for (let col = 0; col < weeks.length; col++) {
    const firstDay = weeks[col][0]
    if (!firstDay) continue
    const month = new Date(firstDay.date).getMonth()
    if (month !== lastMonth) {
      monthLabels.push({ label: MONTH_LABELS[month], col })
      lastMonth = month
    }
  }

  const totalMessages = days.reduce((sum, d) => sum + d.count, 0)

  return { weeks, monthLabels, totalMessages }
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function ContributionHeatmap({ data }: { data: UsageData }) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null)

  const { weeks, monthLabels, totalMessages } = useMemo(
    () => buildHeatmapGrid(data.dailyActivity),
    [data.dailyActivity]
  )

  const cellSize = 11
  const cellGap = 2
  const cellStep = cellSize + cellGap
  const labelWidth = 28
  const topPadding = 18
  const svgWidth = labelWidth + weeks.length * cellStep
  const svgHeight = topPadding + 7 * cellStep

  const levelColors = [
    'var(--heatmap-0, var(--surface-200))',
    'var(--heatmap-1)',
    'var(--heatmap-2)',
    'var(--heatmap-3)',
    'var(--heatmap-4)'
  ]

  return (
    <div className="bg-surface-100 border border-border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-text-secondary">
          {formatNumber(totalMessages)} messages in the last year
        </span>
        {tooltip && (
          <span className="text-[11px] text-text-tertiary">
            {tooltip.count.toLocaleString()} messages on {formatDateLabel(tooltip.date)}
          </span>
        )}
      </div>
      <div>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="block w-full"
          style={{ height: 'auto' }}
        >
          {/* Month labels */}
          {monthLabels.map((m) => (
            <text
              key={`${m.label}-${m.col}`}
              x={labelWidth + m.col * cellStep}
              y={10}
              fontSize="9"
              fill="var(--text-tertiary)"
              fontFamily="var(--font-sans)"
            >
              {m.label}
            </text>
          ))}
          {/* Day labels */}
          {DAY_LABELS.map((label, row) =>
            label ? (
              <text
                key={row}
                x={0}
                y={topPadding + row * cellStep + cellSize - 2}
                fontSize="9"
                fill="var(--text-tertiary)"
                fontFamily="var(--font-sans)"
              >
                {label}
              </text>
            ) : null
          )}
          {/* Cells */}
          {weeks.map((week, col) =>
            week.map((day) => {
              const row = new Date(day.date).getDay()
              return (
                <rect
                  key={day.date}
                  x={labelWidth + col * cellStep}
                  y={topPadding + row * cellStep}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  fill={levelColors[day.level]}
                  onMouseEnter={(e) => {
                    const rect = (e.target as SVGRectElement).getBoundingClientRect()
                    setTooltip({ date: day.date, count: day.count, x: rect.x, y: rect.y })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: 'default' }}
                />
              )
            })
          )}
        </svg>
      </div>
      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-2">
        <span className="text-[10px] text-text-tertiary mr-1">Less</span>
        {levelColors.map((color, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{ width: cellSize, height: cellSize, backgroundColor: color }}
          />
        ))}
        <span className="text-[10px] text-text-tertiary ml-1">More</span>
      </div>
    </div>
  )
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

type CostViewMode = 'day' | 'week' | 'month'

function getDateRange(mode: CostViewMode, offset: number): { start: Date; end: Date; label: string } {
  const today = new Date()
  if (mode === 'day') {
    const target = new Date(today)
    target.setDate(target.getDate() - offset)
    const label = target.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    return { start: target, end: target, label }
  }
  if (mode === 'week') {
    const end = new Date(today)
    end.setDate(end.getDate() - offset * 7)
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
  }
  // month mode
  const target = new Date(today.getFullYear(), today.getMonth() - offset, 1)
  const start = new Date(target.getFullYear(), target.getMonth(), 1)
  const end = new Date(target.getFullYear(), target.getMonth() + 1, 0)
  const label = target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return { start, end, label }
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function DailyCostChart({ dailyCost, hourlyCost }: { dailyCost: DailyCost[]; hourlyCost: HourlyCost[] }) {
  const [mode, setMode] = useState<CostViewMode>('week')
  const [offset, setOffset] = useState(0)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // Reset offset when switching modes
  const handleModeChange = (newMode: CostViewMode) => {
    setMode(newMode)
    setOffset(0)
  }

  const costLookup = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of dailyCost) {
      map.set(entry.date, entry.cost)
    }
    return map
  }, [dailyCost])

  const hourlyLookup = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const entry of hourlyCost) {
      map.set(entry.date, entry.hours)
    }
    return map
  }, [hourlyCost])

  const { bars, label, totalCost } = useMemo(() => {
    const { start, end, label } = getDateRange(mode, offset)

    if (mode === 'day') {
      const dateStr = toDateStr(start)
      const hours = hourlyLookup.get(dateStr) ?? new Array(24).fill(0)
      const bars = hours.map((cost, h) => ({
        date: `${dateStr}-${h}`,
        cost,
        dayLabel: String(h)
      }))
      const totalCost = hours.reduce((sum, c) => sum + c, 0)
      return { bars, label, totalCost }
    }

    const days: { date: string; cost: number; dayLabel: string }[] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const dateStr = toDateStr(cursor)
      days.push({
        date: dateStr,
        cost: costLookup.get(dateStr) ?? 0,
        dayLabel: mode === 'week'
          ? cursor.toLocaleDateString('en-US', { weekday: 'short' })
          : String(cursor.getDate())
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    const totalCost = days.reduce((sum, d) => sum + d.cost, 0)
    return { bars: days, label, totalCost }
  }, [mode, offset, costLookup, hourlyLookup])

  const maxCost = useMemo(() => Math.max(...bars.map((b) => b.cost), 0.01), [bars])

  // Check if we can go forward (not beyond today)
  const canGoForward = offset > 0

  return (
    <div className="bg-surface-100 border border-border-subtle rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-text-secondary">Daily cost</span>
        <div className="flex items-center gap-1">
          {(['day', 'week', 'month'] as const).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`px-2 py-0.5 text-[11px] rounded-md transition-colors capitalize ${
                mode === m
                  ? 'bg-surface-300 text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOffset((o) => o + 1)}
          className="btn-icon btn-icon-sm"
          title={`Previous ${mode}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[11px] text-text-secondary font-medium">{label}</span>
          <span className="text-[10px] text-text-tertiary">{formatCost(totalCost)} total</span>
        </div>
        <button
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={!canGoForward}
          className="btn-icon btn-icon-sm disabled:opacity-30"
          title={`Next ${mode}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-[3px]" style={{ height: 120 }}>
        {bars.map((bar, i) => {
          const heightPct = maxCost > 0 ? (bar.cost / maxCost) * 100 : 0
          const isHovered = hoveredIdx === i
          return (
            <div
              key={bar.date}
              className="flex-1 flex flex-col items-center justify-end h-full"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'default' }}
            >
              {bar.cost > 0 && (
                <span
                  className="text-[9px] text-text-secondary font-medium whitespace-nowrap pointer-events-none mb-1"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 200ms ease'
                  }}
                >
                  {formatCost(bar.cost)}
                </span>
              )}
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${Math.max(heightPct, bar.cost > 0 ? 3 : 0)}%`,
                  backgroundColor: 'var(--color-accent)',
                  opacity: bar.cost > 0 ? (isHovered ? 1 : 0.7) : 0.15,
                  minHeight: bar.cost > 0 ? 2 : 0,
                  transform: isHovered ? 'scaleY(1.04)' : 'scaleY(1)',
                  transformOrigin: 'bottom',
                  transition: 'opacity 300ms ease, transform 300ms ease'
                }}
              />
            </div>
          )
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-[3px] mt-1.5">
        {bars.map((bar, i) => {
          const showLabel = mode === 'week'
            || (mode === 'day' && i % 3 === 0)
            || (mode === 'month' && (i === 0 || i === bars.length - 1 || (i + 1) % 5 === 0))
          return (
            <div key={bar.date} className="flex-1 text-center">
              {showLabel && (
                <span className="text-[8px] text-text-tertiary">{bar.dayLabel}</span>
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage data')
    } finally {
      setLoading(false)
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
            className="btn-icon btn-icon-md disabled:opacity-50"
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

        {/* Contribution heatmap — centerpiece */}
        <ContributionHeatmap data={data} />

        {/* Daily cost bar chart */}
        <DailyCostChart dailyCost={data.dailyCost} hourlyCost={data.hourlyCost} />

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

        {/* Model breakdown */}
        <ModelBreakdown data={data} />
      </div>
    </div>
  )
}
