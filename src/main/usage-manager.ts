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
}

export interface UsageLimits {
  windows: UsageWindow[]
  fetchedAt: number
}

// Distinguishes "we couldn't load it" from "it loaded and you're at 0%".
export interface UsageError {
  error: string
}

// The windows we surface, in display order. Anything the endpoint returns as
// null (not applicable to this plan) is simply skipped.
const WINDOW_DEFS: { key: string; label: string }[] = [
  { key: 'five_hour', label: 'Current session (5h)' },
  { key: 'seven_day', label: 'Weekly · all models' },
  { key: 'seven_day_opus', label: 'Weekly · Opus' }
]

interface RawWindow {
  utilization?: number | null
  resets_at?: string | null
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

function normalize(raw: Record<string, RawWindow | null>): UsageWindow[] {
  const windows: UsageWindow[] = []
  for (const { key, label } of WINDOW_DEFS) {
    const w = raw[key]
    if (!w || w.utilization == null) continue
    const resetsAt = w.resets_at ? Date.parse(w.resets_at) : NaN
    windows.push({
      key,
      label,
      usedPercentage: Math.max(0, Math.min(100, w.utilization)),
      resetsAt: Number.isNaN(resetsAt) ? null : resetsAt
    })
  }
  return windows
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

    let body: Record<string, RawWindow | null>
    try {
      body = (await res.json()) as Record<string, RawWindow | null>
    } catch {
      return { error: 'Got an unexpected response from the usage service.' }
    }

    return { windows: normalize(body), fetchedAt: Date.now() }
  }
}

export const usageManager = new UsageManager()
