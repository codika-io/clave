import { useEffect, useState, type ReactElement } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import type { UsageWindow } from '../../../../preload/index.d'
import { useUsageStore, formatReset } from '../../store/usage-store'
import { ClaudeLogo, CodexLogo, AntigravityLogo } from '../icons/cli-logos'

type Tool = 'claude' | 'codex' | 'antigravity'

const TOOLS: { key: Tool; label: string; Logo: (p: { className?: string }) => ReactElement }[] = [
  { key: 'claude', label: 'Claude Code', Logo: ClaudeLogo },
  { key: 'codex', label: 'Codex', Logo: CodexLogo },
  { key: 'antigravity', label: 'Antigravity', Logo: AntigravityLogo }
]

// Fill color tracks urgency, so a near-full cap reads at a glance. The service sends
// its own plan-aware severity; we take whichever of the two reads more urgent so a
// scoped cap the percentage alone would understate still shows red.
function barColor(window: UsageWindow): string {
  const fromPct =
    window.usedPercentage >= 90 ? 'critical' : window.usedPercentage >= 70 ? 'warning' : 'normal'
  const rank = { normal: 0, warning: 1, critical: 2 }
  const level = rank[window.severity ?? 'normal'] >= rank[fromPct] ? window.severity : fromPct

  if (level === 'critical') return 'bg-red-500'
  if (level === 'warning') return 'bg-amber-500'
  return 'bg-accent'
}

function UsageBar({ window }: { window: UsageWindow }): ReactElement {
  const pct = Math.round(window.usedPercentage)
  const reset = formatReset(window.resetsAt)
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-text-primary">{window.label}</span>
        <span className="text-sm tabular-nums font-semibold text-text-primary">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-200">
        <div
          className={`h-full rounded-full transition-all ${barColor(window)}`}
          style={{ width: `${Math.min(100, Math.max(window.usedPercentage, pct === 0 ? 0 : 2))}%` }}
        />
      </div>
      {reset && <span className="text-xs text-text-tertiary">{reset}</span>}
    </div>
  )
}

function ToolToggle({ tool, onChange }: { tool: Tool; onChange: (t: Tool) => void }): ReactElement {
  return (
    <div className="inline-flex w-full rounded-lg bg-surface-100 p-0.5">
      {TOOLS.map(({ key, label, Logo }) => {
        const active = key === tool
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-surface-200 text-text-primary'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            <Logo className="w-3.5 h-3.5 flex-shrink-0" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function ClaudeUsage(): ReactElement {
  // The same store the sidebar's foot reads, so one request serves both and
  // this button refreshes the number down there too. It used to own a fetch of
  // its own, which meant opening this pane hit the network again and the two
  // readouts could disagree.
  const status = useUsageStore((s) => s.status)
  const windows = useUsageStore((s) => s.windows)
  const error = useUsageStore((s) => s.error)
  const load = useUsageStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  const loading = status === 'loading'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => load({ force: true })}
          disabled={loading}
          className="btn-icon btn-icon-xs disabled:opacity-50"
          title="Refresh"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {(status === 'loading' || status === 'idle') && (
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 w-40 animate-pulse rounded bg-surface-200" />
              <div className="h-2 w-full animate-pulse rounded-full bg-surface-200" />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-start gap-3 py-4">
          <span className="text-sm text-text-tertiary">{error}</span>
          <button
            onClick={() => load({ force: true })}
            className="text-xs text-accent transition-colors hover:text-accent-hover"
          >
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && windows.length === 0 && (
        <span className="text-sm text-text-tertiary">No usage limits to show yet.</span>
      )}

      {status === 'ready' && windows.length > 0 && (
        <div className="space-y-5">
          {windows.map((w) => (
            <UsageBar key={w.key} window={w} />
          ))}
        </div>
      )}
    </div>
  )
}

function ComingSoon({ label }: { label: string }): ReactElement {
  return (
    <div className="flex flex-col items-center gap-1.5 py-12 text-center">
      <span className="text-sm font-medium text-text-primary">
        {label} usage isn’t available yet
      </span>
      <span className="text-xs text-text-tertiary">
        We’re working on bringing usage limits to {label}.
      </span>
    </div>
  )
}

/** Usage limits content — embedded in the settings page's Usage section. */
export function UsagePanel(): ReactElement {
  const [tool, setTool] = useState<Tool>('claude')

  return (
    <div className="space-y-4">
      <ToolToggle tool={tool} onChange={setTool} />
      <div className="settings-card">
        <div className="px-3.5 py-3">
          {tool === 'claude' && <ClaudeUsage />}
          {tool === 'codex' && <ComingSoon label="Codex" />}
          {tool === 'antigravity' && <ComingSoon label="Antigravity" />}
        </div>
      </div>
    </div>
  )
}
