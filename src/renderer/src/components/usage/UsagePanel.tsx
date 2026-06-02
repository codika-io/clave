import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import type { UsageLimits, UsageWindow } from '../../../../preload/index.d'
import { ClaudeLogo, CodexLogo, GeminiLogo } from '../icons/cli-logos'

type Tool = 'claude' | 'codex' | 'gemini'

const TOOLS: { key: Tool; label: string; Logo: (p: { className?: string }) => ReactElement }[] = [
  { key: 'claude', label: 'Claude Code', Logo: ClaudeLogo },
  { key: 'codex', label: 'Codex', Logo: CodexLogo },
  { key: 'gemini', label: 'Gemini', Logo: GeminiLogo }
]

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: UsageLimits }

// Mirrors the statusline's fmt_dur: seconds → "3h12m" / "12m".
function formatReset(resetsAt: number | null): string | null {
  if (resetsAt == null) return null
  const secs = Math.max(0, Math.round((resetsAt - Date.now()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `resets in ${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `resets in ${m}m`
  return 'resets shortly'
}

// Fill color tracks urgency, so a near-full cap reads at a glance.
function barColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-accent'
}

function UsageBar({ window }: { window: UsageWindow }) {
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
          className={`h-full rounded-full transition-all ${barColor(window.usedPercentage)}`}
          style={{ width: `${Math.min(100, Math.max(window.usedPercentage, pct === 0 ? 0 : 2))}%` }}
        />
      </div>
      {reset && <span className="text-xs text-text-tertiary">{reset}</span>}
    </div>
  )
}

function ToolToggle({ tool, onChange }: { tool: Tool; onChange: (t: Tool) => void }) {
  return (
    <div className="inline-flex w-full rounded-lg bg-surface-100 p-0.5">
      {TOOLS.map(({ key, label, Logo }) => {
        const active = key === tool
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
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

function ClaudeUsage() {
  const [state, setState] = useState<FetchState>({ status: 'loading' })

  const fetchData = useCallback(async () => {
    setState({ status: 'loading' })
    if (!window.electronAPI?.getUsageLimits) {
      setState({ status: 'error', message: 'Usage is only available in the desktop app.' })
      return
    }
    try {
      const result = await window.electronAPI.getUsageLimits()
      if ('error' in result) {
        setState({ status: 'error', message: result.error })
        return
      }
      setState({ status: 'ready', data: result })
    } catch {
      setState({ status: 'error', message: 'Failed to load usage.' })
    }
  }, [])

  // Lazy: this only mounts while the Claude tab is selected, so it fetches each
  // time the tab is opened and never runs in the background.
  useEffect(() => {
    fetchData()
  }, [fetchData])

  const loading = state.status === 'loading'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={fetchData}
          disabled={loading}
          className="btn-icon btn-icon-md disabled:opacity-50"
          title="Refresh"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {state.status === 'loading' && (
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 w-40 animate-pulse rounded bg-surface-200" />
              <div className="h-2 w-full animate-pulse rounded-full bg-surface-200" />
            </div>
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-3 py-4">
          <span className="text-sm text-text-tertiary">{state.message}</span>
          <button
            onClick={fetchData}
            className="text-xs text-accent transition-colors hover:text-accent-hover"
          >
            Retry
          </button>
        </div>
      )}

      {state.status === 'ready' && state.data.windows.length === 0 && (
        <span className="text-sm text-text-tertiary">No usage limits to show yet.</span>
      )}

      {state.status === 'ready' && state.data.windows.length > 0 && (
        <div className="space-y-5">
          {state.data.windows.map((w) => (
            <UsageBar key={w.key} window={w} />
          ))}
        </div>
      )}
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-12 text-center">
      <span className="text-sm font-medium text-text-primary">{label} usage isn’t available yet</span>
      <span className="text-xs text-text-tertiary">We’re working on bringing usage limits to {label}.</span>
    </div>
  )
}

export function UsagePanel() {
  const [tool, setTool] = useState<Tool>('claude')

  return (
    <div className="flex-1 overflow-y-auto bg-surface-50">
      <div className="mx-auto max-w-md space-y-6 p-6">
        <h2 className="text-sm font-semibold text-text-primary">Usage</h2>
        <ToolToggle tool={tool} onChange={setTool} />
        {tool === 'claude' && <ClaudeUsage />}
        {tool === 'codex' && <ComingSoon label="Codex" />}
        {tool === 'gemini' && <ComingSoon label="Gemini" />}
      </div>
    </div>
  )
}
