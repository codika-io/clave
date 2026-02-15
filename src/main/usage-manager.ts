import * as fs from 'fs'
import * as path from 'path'
import * as pty from 'node-pty'
import { execFileSync } from 'child_process'
import { app } from 'electron'

export interface DailyActivity {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
}

export interface DailyModelTokens {
  date: string
  tokensByModel: Record<string, number>
}

export interface ModelTokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export interface RateLimitEntry {
  label: string
  percent: number
  resetInfo: string
}

export interface RateLimits {
  entries: RateLimitEntry[]
  fetchedAt: number
}

export interface UsageData {
  dailyActivity: DailyActivity[]
  dailyModelTokens: DailyModelTokens[]
  modelUsage: Record<string, ModelTokenUsage>
  totalSessions: number
  totalMessages: number
  firstSessionDate: string | null
  hourCounts: Record<string, number>
  estimatedCost: number
  totalTokens: number
  rateLimits: RateLimits | null
}

// Pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number }> = {
  'claude-opus-4-5-20251101': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 }
}

function getDefaultPricing() {
  return { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 }
}

function computeCost(model: string, usage: ModelTokenUsage): number {
  const pricing = MODEL_PRICING[model] ?? getDefaultPricing()
  const m = 1_000_000
  return (
    (usage.inputTokens / m) * pricing.input +
    (usage.outputTokens / m) * pricing.output +
    (usage.cacheReadInputTokens / m) * pricing.cacheRead +
    (usage.cacheCreationInputTokens / m) * pricing.cacheCreation
  )
}

function getLoginShellEnv(): Record<string, string> {
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const output = execFileSync(shell, ['-lic', 'env -0'], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    })
    const env: Record<string, string> = {}
    for (const entry of output.split('\0')) {
      const idx = entry.indexOf('=')
      if (idx > 0) {
        env[entry.slice(0, idx)] = entry.slice(idx + 1)
      }
    }
    return Object.keys(env).length > 0 ? env : { ...process.env } as Record<string, string>
  } catch {
    return { ...process.env } as Record<string, string>
  }
}

function stripAnsi(str: string): string {
  return str
    // Replace cursor movement codes (e.g. \x1B[1C = move right 1 col) with a space
    .replace(/\x1B\[\d*C/g, ' ')
    // Remove all other CSI sequences
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove OSC sequences
    .replace(/\x1B\]\d*;[^\x07]*\x07/g, '')
    // Remove DEC private mode sequences
    .replace(/\x1B\[[\?][0-9;]*[a-zA-Z]/g, '')
    // Remove remaining control characters (except newline/carriage return)
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/** Normalize a parsed label to ensure proper spacing */
function normalizeLabel(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/Current\s*week\s*\(\s*all\s*models\s*\)/i, 'Current week (all models)')
    .replace(/Current\s*week\s*\(\s*Sonnet\s*only\s*\)/i, 'Current week (Sonnet only)')
    .replace(/Current\s*session/i, 'Current session')
    .trim()
}

/** Normalize reset info text to ensure proper spacing */
function normalizeResetInfo(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    // Add space before opening parenthesis if missing: "4:59pm(Europe" → "4:59pm (Europe"
    .replace(/(\w)\(/, '$1 (')
    // Add space between date parts: "Feb20at1pm" → "Feb 20 at 1pm"
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRateLimits(rawOutput: string): RateLimitEntry[] {
  const clean = stripAnsi(rawOutput)
  const entries: RateLimitEntry[] = []

  // Split into sections by looking for "Current session" or "Current week" headers
  const sectionRegex = /(Current\s*session|Current\s*week\s*\([^)]*\))/gi

  // Find all section headers
  const headers: { label: string; index: number }[] = []
  let match: RegExpExecArray | null
  while ((match = sectionRegex.exec(clean)) !== null) {
    headers.push({ label: normalizeLabel(match[1]), index: match.index })
  }

  // For each header, extract percent and reset info from the text following it
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index
    const end = i + 1 < headers.length ? headers[i + 1].index : clean.length
    const section = clean.slice(start, end)

    let percent = 0
    const pMatch = /(\d+)\s*%\s*used/i.exec(section)
    if (pMatch) {
      percent = parseInt(pMatch[1], 10)
    }

    let resetInfo = ''
    const rMatch = /Resets?\s*([A-Za-z0-9 :,]+\([^)]*\))/i.exec(section)
    if (rMatch) {
      resetInfo = normalizeResetInfo('Resets ' + rMatch[1])
    }

    entries.push({
      label: headers[i].label,
      percent,
      resetInfo
    })
  }

  return entries
}

function fetchRateLimitsFromClaude(): Promise<RateLimits | null> {
  return new Promise((resolve) => {
    const timeoutMs = 20000
    let output = ''
    let resolved = false

    const done = (result: RateLimits | null) => {
      if (resolved) return
      resolved = true
      try { proc.kill(); } catch { /* ignore */ }
      resolve(result)
    }

    const env = getLoginShellEnv()
    delete env.CLAUDECODE

    const shell = process.env.SHELL || '/bin/zsh'
    const proc = pty.spawn(shell, ['-l', '-c', 'claude'], {
      cols: 120,
      rows: 40,
      env: { ...env, TERM: 'xterm-256color' }
    })

    proc.onData((data) => {
      output += data
    })

    proc.onExit(() => {
      if (!resolved) done(null)
    })

    // After 4s, type /usage
    setTimeout(() => {
      if (resolved) return
      proc.write('/usage')
    }, 4000)

    // After 5s, dismiss autocomplete with Escape
    setTimeout(() => {
      if (resolved) return
      proc.write('\x1b')
    }, 5000)

    // After 5.5s, press Enter to execute
    setTimeout(() => {
      if (resolved) return
      proc.write('\r')
    }, 5500)

    // After 12s, parse output and clean up
    setTimeout(() => {
      if (resolved) return
      const entries = parseRateLimits(output)
      if (entries.length > 0) {
        done({ entries, fetchedAt: Date.now() })
      } else {
        done(null)
      }
    }, 12000)

    // Safety timeout
    setTimeout(() => done(null), timeoutMs)
  })
}

interface StatsCache {
  dailyActivity: DailyActivity[]
  dailyModelTokens: DailyModelTokens[]
  modelUsage: Record<string, ModelTokenUsage>
  totalSessions: number
  totalMessages: number
  firstSessionDate: string
  hourCounts: Record<string, number>
}

class UsageManager {
  private cachePath: string
  private cachedData: UsageData | null = null
  private cachedMtime: number = 0
  private cachedRateLimits: RateLimits | null = null
  private rateLimitFetching = false

  constructor() {
    this.cachePath = path.join(app.getPath('home'), '.claude', 'stats-cache.json')
  }

  getStats(): UsageData {
    try {
      const stat = fs.statSync(this.cachePath)
      const mtime = stat.mtimeMs

      if (this.cachedData && mtime === this.cachedMtime) {
        return { ...this.cachedData, rateLimits: this.cachedRateLimits }
      }

      const raw = fs.readFileSync(this.cachePath, 'utf-8')
      const data = JSON.parse(raw) as StatsCache

      let estimatedCost = 0
      let totalTokens = 0

      for (const [model, usage] of Object.entries(data.modelUsage ?? {})) {
        estimatedCost += computeCost(model, usage)
        totalTokens +=
          usage.inputTokens +
          usage.outputTokens +
          usage.cacheReadInputTokens +
          usage.cacheCreationInputTokens
      }

      const result: UsageData = {
        dailyActivity: data.dailyActivity ?? [],
        dailyModelTokens: data.dailyModelTokens ?? [],
        modelUsage: data.modelUsage ?? {},
        totalSessions: data.totalSessions ?? 0,
        totalMessages: data.totalMessages ?? 0,
        firstSessionDate: data.firstSessionDate ?? null,
        hourCounts: data.hourCounts ?? {},
        estimatedCost,
        totalTokens,
        rateLimits: this.cachedRateLimits
      }

      this.cachedData = result
      this.cachedMtime = mtime
      return result
    } catch {
      return {
        dailyActivity: [],
        dailyModelTokens: [],
        modelUsage: {},
        totalSessions: 0,
        totalMessages: 0,
        firstSessionDate: null,
        hourCounts: {},
        estimatedCost: 0,
        totalTokens: 0,
        rateLimits: this.cachedRateLimits
      }
    }
  }

  async fetchRateLimits(): Promise<RateLimits | null> {
    if (this.rateLimitFetching) {
      return this.cachedRateLimits
    }
    this.rateLimitFetching = true
    try {
      const result = await fetchRateLimitsFromClaude()
      if (result) {
        this.cachedRateLimits = result
      }
      return this.cachedRateLimits
    } finally {
      this.rateLimitFetching = false
    }
  }
}

export const usageManager = new UsageManager()
