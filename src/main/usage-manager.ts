import { execFileSync } from 'child_process'

// Single source of truth for rate-limit usage — the same OAuth endpoint Claude Code
// itself queries to populate the `rate_limits` block of its statusline JSON. The
// statusline script is only a passive consumer of that data; we go straight to the source.
const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage'
const KEYCHAIN_SERVICE = 'Claude Code-credentials'
const OAUTH_BETA = 'oauth-2025-04-20'

// One usage window (5-hour block or a weekly cap), normalized for the UI.
export interface UsageWindow {
  key: string
  label: string
  // 0–100, already a percentage of the cap consumed.
  usedPercentage: number
  // Unix epoch milliseconds when this window resets, or null if unknown.
  resetsAt: number | null
  // The service's own urgency verdict, when it sends one. Plan-aware, so it can
  // disagree with a naive percentage threshold — prefer it over guessing.
  severity: 'normal' | 'warning' | 'critical' | null
}

export interface UsageLimits {
  windows: UsageWindow[]
  fetchedAt: number
}

// Distinguishes "we couldn't load it" from "it loaded and you're at 0%".
export interface UsageError {
  error: string
}

// Legacy fallback only. The endpoint's flat `seven_day_<model>` keys are frozen in
// time — per-model caps introduced after them (Fable) never got a key and read null
// here forever — so these are used only when `limits` is missing from the response.
const WINDOW_DEFS: { key: string; label: string }[] = [
  { key: 'five_hour', label: 'Current session (5h)' },
  { key: 'seven_day', label: 'Weekly · all models' },
  { key: 'seven_day_opus', label: 'Weekly · Opus' }
]

// Display order by limit kind; anything unrecognized sorts last but still renders.
const KIND_RANK: Record<string, number> = {
  session: 0,
  weekly_all: 1,
  weekly_scoped: 2
}

interface RawWindow {
  utilization?: number | null
  resets_at?: string | null
}

interface RawScopeName {
  display_name?: string | null
}

// The `limits` array is self-describing: each entry names its own kind and scope,
// so a per-model cap we've never heard of still renders with the right label.
interface RawLimit {
  kind?: string | null
  percent?: number | null
  severity?: string | null
  resets_at?: string | null
  scope?: {
    model?: RawScopeName | null
    surface?: RawScopeName | null
  } | null
}

interface RawUsageBody {
  limits?: RawLimit[] | null
}

function readAccessToken(): string | null {
  try {
    // `security` lives at a fixed system path — no PATH resolution needed, so
    // execFileSync (not execSync) is safe here and avoids the login-shell dance.
    const raw = execFileSync('/usr/bin/security', [
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-w'
    ])
      .toString()
      .trim()
    const parsed = JSON.parse(raw)
    const oauth = parsed.claudeAiOauth ?? parsed
    return typeof oauth.accessToken === 'string' ? oauth.accessToken : null
  } catch {
    return null
  }
}

function parseResetsAt(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function parseSeverity(value: string | null | undefined): UsageWindow['severity'] {
  return value === 'normal' || value === 'warning' || value === 'critical' ? value : null
}

// "weekly_scoped" → "Weekly scoped", so an unrecognized kind still reads as words.
function humanizeKind(kind: string): string {
  const spaced = kind.replace(/_/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function labelForLimit(limit: RawLimit): string {
  const kind = limit.kind ?? ''
  // A scoped limit is named by what it's scoped to — the model (Fable, Opus) or,
  // failing that, the surface — which is the only place a new per-model cap surfaces.
  const scopeName =
    limit.scope?.model?.display_name?.trim() || limit.scope?.surface?.display_name?.trim() || ''

  if (kind === 'session') return 'Current session (5h)'
  if (kind === 'weekly_all') return 'Weekly · all models'
  if (kind === 'weekly_scoped') return scopeName ? `Weekly · ${scopeName}` : 'Weekly · scoped'
  const base = kind ? humanizeKind(kind) : 'Usage'
  return scopeName ? `${base} · ${scopeName}` : base
}

function normalizeLimits(limits: RawLimit[]): UsageWindow[] {
  const ranked: { window: UsageWindow; rank: number; index: number }[] = []
  const seenKeys = new Set<string>()

  limits.forEach((limit, index) => {
    if (!limit || limit.percent == null) return
    const label = labelForLimit(limit)
    const kind = limit.kind ?? 'limit'

    // Two scoped limits share a kind, so the label disambiguates the React key.
    let key = `${kind}:${label}`
    while (seenKeys.has(key)) key = `${key}:${index}`
    seenKeys.add(key)

    ranked.push({
      window: {
        key,
        label,
        usedPercentage: Math.max(0, Math.min(100, limit.percent)),
        resetsAt: parseResetsAt(limit.resets_at),
        severity: parseSeverity(limit.severity)
      },
      rank: KIND_RANK[kind] ?? Number.MAX_SAFE_INTEGER,
      index
    })
  })

  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((entry) => entry.window)
}

function normalizeLegacyWindows(raw: Record<string, RawWindow | null>): UsageWindow[] {
  const windows: UsageWindow[] = []
  for (const { key, label } of WINDOW_DEFS) {
    const w = raw[key]
    if (!w || w.utilization == null) continue
    windows.push({
      key,
      label,
      usedPercentage: Math.max(0, Math.min(100, w.utilization)),
      resetsAt: parseResetsAt(w.resets_at),
      severity: null
    })
  }
  return windows
}

function normalize(body: RawUsageBody): UsageWindow[] {
  if (Array.isArray(body.limits)) {
    const windows = normalizeLimits(body.limits)
    if (windows.length > 0) return windows
  }
  return normalizeLegacyWindows(body as unknown as Record<string, RawWindow | null>)
}

class UsageManager {
  async getLimits(): Promise<UsageLimits | UsageError> {
    const token = readAccessToken()
    if (!token) {
      return { error: 'Sign in to Claude Code to see usage limits.' }
    }

    let res: Response
    try {
      res = await fetch(USAGE_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': OAUTH_BETA
        }
      })
    } catch {
      return { error: 'Could not reach the usage service. Check your connection.' }
    }

    if (res.status === 401) {
      return { error: 'Your Claude Code session expired. Run a session to refresh it.' }
    }
    if (!res.ok) {
      return { error: `Usage service returned ${res.status}.` }
    }

    let body: RawUsageBody
    try {
      body = (await res.json()) as RawUsageBody
    } catch {
      return { error: 'Got an unexpected response from the usage service.' }
    }

    return { windows: normalize(body), fetchedAt: Date.now() }
  }
}

export const usageManager = new UsageManager()
