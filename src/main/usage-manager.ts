import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { app } from 'electron'

export interface DailyActivity {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
}

export interface DailyModelTokens {
  date: string
  tokensByModel: Record<string, ModelTokenUsage>
}

export interface DailyCost {
  date: string
  cost: number
}

export interface ModelTokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export interface HourlyCost {
  date: string
  hours: number[] // 24 entries, index 0 = midnight
}

export interface UsageData {
  dailyActivity: DailyActivity[]
  dailyModelTokens: DailyModelTokens[]
  dailyCost: DailyCost[]
  hourlyCost: HourlyCost[]
  modelUsage: Record<string, ModelTokenUsage>
  totalSessions: number
  totalMessages: number
  firstSessionDate: string | null
  estimatedCost: number
  totalTokens: number
}

// Pricing per 1M tokens (USD)
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheCreation: number }
> = {
  'claude-opus-4-5-20251101': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
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

// --- Per-file cache types ---

interface PerFileSummary {
  mtime: number
  sessionId: string
  messages: number
  toolCalls: number
  dailyMessages: Record<string, number>
  dailyToolCalls: Record<string, number>
  dailySessions: Record<string, boolean>
  modelUsage: Record<string, ModelTokenUsage>
  dailyModelTokens: Record<string, Record<string, ModelTokenUsage>>
  // date -> hour (0-23) -> model -> token usage
  dailyHourlyTokens: Record<string, Record<string, Record<string, ModelTokenUsage>>>
  firstTimestamp: string | null
}

interface UsageCache {
  version: 5
  files: Record<string, PerFileSummary>
}

// --- JSONL parsing ---

interface ParsedAssistantEntry {
  model: string
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  }
  timestamp: string
}

interface ParsedEntry {
  type: string
  timestamp?: string
  sessionId?: string
  uuid?: string
  message?: {
    id?: string
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
    content?: unknown[]
  }
  // tool use result entries have this key
  toolUseResult?: unknown
}

async function parseJsonlFile(
  filePath: string
): Promise<{
  sessionId: string
  assistantEntries: ParsedAssistantEntry[]
  userMessageCount: number
  toolCallCount: number
  timestamps: string[]
}> {
  const assistantMap = new Map<
    string,
    { model: string; usage: ParsedAssistantEntry['usage']; timestamp: string }
  >()
  let userMessageCount = 0
  let toolCallCount = 0
  let sessionId = ''
  const timestamps: string[] = []

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue
    let entry: ParsedEntry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    if (!sessionId && entry.sessionId) {
      sessionId = entry.sessionId
    }

    if (entry.timestamp) {
      timestamps.push(entry.timestamp)
    }

    if (entry.type === 'user') {
      // Count user text messages (not tool results)
      if (!entry.toolUseResult) {
        userMessageCount++
      }
      // Count tool_result blocks in message content
      if (Array.isArray(entry.message?.content)) {
        for (const block of entry.message!.content) {
          if (block && typeof block === 'object' && 'type' in block && (block as { type: string }).type === 'tool_result') {
            toolCallCount++
          }
        }
      }
    }

    if (entry.type === 'assistant' && entry.message?.usage) {
      const msgId = entry.message.id || entry.uuid || ''
      if (!msgId) continue

      const model = entry.message.model || ''
      if (!model || !model.startsWith('claude-')) continue

      const u = entry.message.usage
      assistantMap.set(msgId, {
        model,
        usage: {
          input_tokens: u.input_tokens ?? 0,
          output_tokens: u.output_tokens ?? 0,
          cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0
        },
        timestamp: entry.timestamp || ''
      })
    }
  }

  const assistantEntries: ParsedAssistantEntry[] = []
  for (const val of assistantMap.values()) {
    assistantEntries.push({
      model: val.model,
      usage: val.usage,
      timestamp: val.timestamp
    })
  }

  return { sessionId, assistantEntries, userMessageCount, toolCallCount, timestamps }
}

function buildFileSummary(parsed: Awaited<ReturnType<typeof parseJsonlFile>>, mtime: number): PerFileSummary {
  const dailyMessages: Record<string, number> = {}
  const dailyToolCalls: Record<string, number> = {}
  const dailySessions: Record<string, boolean> = {}
  const modelUsage: Record<string, ModelTokenUsage> = {}
  const dailyModelTokens: Record<string, Record<string, ModelTokenUsage>> = {}
  const dailyHourlyTokens: Record<string, Record<string, Record<string, ModelTokenUsage>>> = {}

  let firstTimestamp: string | null = null
  if (parsed.timestamps.length > 0) {
    firstTimestamp = parsed.timestamps[0]
  }

  // Distribute user messages across days using timestamps
  // We use the first and assistant timestamps to build daily distributions
  for (const ts of parsed.timestamps) {
    const date = ts.slice(0, 10)
    if (!dailySessions[date]) {
      dailySessions[date] = true
    }
  }

  // Count messages per day from assistant entries (each deduped assistant entry = 1 API call)
  // For user messages, distribute proportionally across days the session was active
  // Simple approach: attribute all user messages to the session's active days
  const activeDays = Object.keys(dailySessions).sort()
  if (activeDays.length > 0 && parsed.userMessageCount > 0) {
    // Distribute user messages: count timestamps per day, use as weight
    const dayTimestampCounts: Record<string, number> = {}
    for (const ts of parsed.timestamps) {
      const d = ts.slice(0, 10)
      dayTimestampCounts[d] = (dayTimestampCounts[d] || 0) + 1
    }
    const totalTs = parsed.timestamps.length || 1
    let distributed = 0
    for (let i = 0; i < activeDays.length; i++) {
      const day = activeDays[i]
      if (i === activeDays.length - 1) {
        // Last day gets remainder
        dailyMessages[day] = parsed.userMessageCount - distributed
      } else {
        const share = Math.round(
          (parsed.userMessageCount * (dayTimestampCounts[day] || 0)) / totalTs
        )
        dailyMessages[day] = share
        distributed += share
      }
    }
  }

  // Distribute tool calls similarly
  if (activeDays.length > 0 && parsed.toolCallCount > 0) {
    const dayTimestampCounts: Record<string, number> = {}
    for (const ts of parsed.timestamps) {
      const d = ts.slice(0, 10)
      dayTimestampCounts[d] = (dayTimestampCounts[d] || 0) + 1
    }
    const totalTs = parsed.timestamps.length || 1
    let distributed = 0
    for (let i = 0; i < activeDays.length; i++) {
      const day = activeDays[i]
      if (i === activeDays.length - 1) {
        dailyToolCalls[day] = parsed.toolCallCount - distributed
      } else {
        const share = Math.round(
          (parsed.toolCallCount * (dayTimestampCounts[day] || 0)) / totalTs
        )
        dailyToolCalls[day] = share
        distributed += share
      }
    }
  }

  // Aggregate assistant entries into model usage and daily model tokens
  for (const entry of parsed.assistantEntries) {
    const model = entry.model
    if (!modelUsage[model]) {
      modelUsage[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0
      }
    }
    modelUsage[model].inputTokens += entry.usage.input_tokens
    modelUsage[model].outputTokens += entry.usage.output_tokens
    modelUsage[model].cacheReadInputTokens += entry.usage.cache_read_input_tokens
    modelUsage[model].cacheCreationInputTokens += entry.usage.cache_creation_input_tokens

    const date = entry.timestamp ? entry.timestamp.slice(0, 10) : activeDays[0] || ''
    if (date) {
      if (!dailyModelTokens[date]) dailyModelTokens[date] = {}
      if (!dailyModelTokens[date][model]) {
        dailyModelTokens[date][model] = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0
        }
      }
      dailyModelTokens[date][model].inputTokens += entry.usage.input_tokens
      dailyModelTokens[date][model].outputTokens += entry.usage.output_tokens
      dailyModelTokens[date][model].cacheReadInputTokens += entry.usage.cache_read_input_tokens
      dailyModelTokens[date][model].cacheCreationInputTokens += entry.usage.cache_creation_input_tokens

      // Hourly breakdown
      const hour = entry.timestamp ? String(new Date(entry.timestamp).getHours()) : '0'
      if (!dailyHourlyTokens[date]) dailyHourlyTokens[date] = {}
      if (!dailyHourlyTokens[date][hour]) dailyHourlyTokens[date][hour] = {}
      if (!dailyHourlyTokens[date][hour][model]) {
        dailyHourlyTokens[date][hour][model] = {
          inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0
        }
      }
      dailyHourlyTokens[date][hour][model].inputTokens += entry.usage.input_tokens
      dailyHourlyTokens[date][hour][model].outputTokens += entry.usage.output_tokens
      dailyHourlyTokens[date][hour][model].cacheReadInputTokens += entry.usage.cache_read_input_tokens
      dailyHourlyTokens[date][hour][model].cacheCreationInputTokens += entry.usage.cache_creation_input_tokens
    }
  }

  return {
    mtime,
    sessionId: parsed.sessionId,
    messages: parsed.userMessageCount,
    toolCalls: parsed.toolCallCount,
    dailyMessages,
    dailyToolCalls,
    dailySessions,
    modelUsage,
    dailyModelTokens,
    dailyHourlyTokens,
    firstTimestamp
  }
}

function mergeAllSummaries(files: Record<string, PerFileSummary>): UsageData {
  const dailyMessagesMap: Record<string, number> = {}
  const dailySessionsMap: Record<string, Set<string>> = {}
  const dailyToolCallsMap: Record<string, number> = {}
  const modelUsageMap: Record<string, ModelTokenUsage> = {}
  const dailyModelTokensMap: Record<string, Record<string, ModelTokenUsage>> = {}
  // date -> hour -> model -> usage
  const dailyHourlyTokensMap: Record<string, Record<string, Record<string, ModelTokenUsage>>> = {}

  let totalMessages = 0
  let totalSessions = 0
  let firstSessionDate: string | null = null
  const sessionIds = new Set<string>()

  for (const summary of Object.values(files)) {
    totalMessages += summary.messages

    if (summary.sessionId && !sessionIds.has(summary.sessionId)) {
      sessionIds.add(summary.sessionId)
      totalSessions++
    }

    if (summary.firstTimestamp) {
      const date = summary.firstTimestamp.slice(0, 10)
      if (!firstSessionDate || date < firstSessionDate) {
        firstSessionDate = date
      }
    }

    for (const [date, count] of Object.entries(summary.dailyMessages)) {
      dailyMessagesMap[date] = (dailyMessagesMap[date] || 0) + count
    }

    for (const [date, count] of Object.entries(summary.dailyToolCalls)) {
      dailyToolCallsMap[date] = (dailyToolCallsMap[date] || 0) + count
    }

    for (const [date] of Object.entries(summary.dailySessions)) {
      if (!dailySessionsMap[date]) dailySessionsMap[date] = new Set()
      if (summary.sessionId) dailySessionsMap[date].add(summary.sessionId)
    }

    for (const [date, hours] of Object.entries(summary.dailyHourlyTokens || {})) {
      if (!dailyHourlyTokensMap[date]) dailyHourlyTokensMap[date] = {}
      for (const [hour, models] of Object.entries(hours)) {
        if (!dailyHourlyTokensMap[date][hour]) dailyHourlyTokensMap[date][hour] = {}
        for (const [model, usage] of Object.entries(models)) {
          if (!dailyHourlyTokensMap[date][hour][model]) {
            dailyHourlyTokensMap[date][hour][model] = {
              inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0
            }
          }
          dailyHourlyTokensMap[date][hour][model].inputTokens += usage.inputTokens
          dailyHourlyTokensMap[date][hour][model].outputTokens += usage.outputTokens
          dailyHourlyTokensMap[date][hour][model].cacheReadInputTokens += usage.cacheReadInputTokens
          dailyHourlyTokensMap[date][hour][model].cacheCreationInputTokens += usage.cacheCreationInputTokens
        }
      }
    }

    for (const [model, usage] of Object.entries(summary.modelUsage)) {
      if (!modelUsageMap[model]) {
        modelUsageMap[model] = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0
        }
      }
      modelUsageMap[model].inputTokens += usage.inputTokens
      modelUsageMap[model].outputTokens += usage.outputTokens
      modelUsageMap[model].cacheReadInputTokens += usage.cacheReadInputTokens
      modelUsageMap[model].cacheCreationInputTokens += usage.cacheCreationInputTokens
    }

    for (const [date, models] of Object.entries(summary.dailyModelTokens)) {
      if (!dailyModelTokensMap[date]) dailyModelTokensMap[date] = {}
      for (const [model, usage] of Object.entries(models)) {
        if (!dailyModelTokensMap[date][model]) {
          dailyModelTokensMap[date][model] = {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0
          }
        }
        dailyModelTokensMap[date][model].inputTokens += usage.inputTokens
        dailyModelTokensMap[date][model].outputTokens += usage.outputTokens
        dailyModelTokensMap[date][model].cacheReadInputTokens += usage.cacheReadInputTokens
        dailyModelTokensMap[date][model].cacheCreationInputTokens += usage.cacheCreationInputTokens
      }
    }
  }

  // Build sorted arrays
  const allDates = new Set([
    ...Object.keys(dailyMessagesMap),
    ...Object.keys(dailySessionsMap),
    ...Object.keys(dailyToolCallsMap)
  ])
  const dailyActivity: DailyActivity[] = Array.from(allDates)
    .sort()
    .map((date) => ({
      date,
      messageCount: dailyMessagesMap[date] || 0,
      sessionCount: dailySessionsMap[date]?.size || 0,
      toolCallCount: dailyToolCallsMap[date] || 0
    }))

  const dailyModelTokens: DailyModelTokens[] = Object.entries(dailyModelTokensMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tokensByModel]) => ({ date, tokensByModel }))

  // Compute daily cost from per-day per-model breakdowns
  const dailyCost: DailyCost[] = Object.entries(dailyModelTokensMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, models]) => {
      let cost = 0
      for (const [model, usage] of Object.entries(models)) {
        cost += computeCost(model, usage)
      }
      return { date, cost }
    })

  // Compute hourly cost per day
  const hourlyCost: HourlyCost[] = Object.entries(dailyHourlyTokensMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, hours]) => {
      const costArr = new Array(24).fill(0)
      for (const [hour, models] of Object.entries(hours)) {
        for (const [model, usage] of Object.entries(models)) {
          costArr[Number(hour)] += computeCost(model, usage)
        }
      }
      return { date, hours: costArr }
    })

  let estimatedCost = 0
  let totalTokens = 0
  for (const [model, usage] of Object.entries(modelUsageMap)) {
    estimatedCost += computeCost(model, usage)
    totalTokens +=
      usage.inputTokens +
      usage.outputTokens +
      usage.cacheReadInputTokens +
      usage.cacheCreationInputTokens
  }

  return {
    dailyActivity,
    dailyModelTokens,
    dailyCost,
    hourlyCost,
    modelUsage: modelUsageMap,
    totalSessions,
    totalMessages,
    firstSessionDate,
    estimatedCost,
    totalTokens
  }
}

// --- Concurrency limiter ---

async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// --- Main manager ---

class UsageManager {
  private cachePath: string
  private cache: UsageCache = { version: 5, files: {} }
  private cacheLoaded = false
  private cachedResult: UsageData | null = null

  constructor() {
    this.cachePath = path.join(app.getPath('home'), '.claude', 'clave-usage-cache.json')
  }

  private loadCache(): void {
    if (this.cacheLoaded) return
    try {
      const raw = fs.readFileSync(this.cachePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version === 4 && parsed.files) {
        this.cache = parsed as UsageCache
      }
    } catch (err) {
      console.warn('[usage] Cache load failed, starting fresh:', (err as Error).message)
    }
    this.cacheLoaded = true
  }

  private saveCache(): void {
    try {
      const dir = path.dirname(this.cachePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache), 'utf-8')
    } catch (err) {
      console.warn('[usage] Cache save failed:', (err as Error).message)
    }
  }

  async getStats(): Promise<UsageData> {
    this.loadCache()

    const claudeDir = path.join(app.getPath('home'), '.claude', 'projects')
    let jsonlFiles: string[] = []
    try {
      const entries = fs.readdirSync(claudeDir, { recursive: true, withFileTypes: true })
      jsonlFiles = entries
        .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
        .map((e) => path.join(e.parentPath, e.name))
    } catch {
      // Directory might not exist
    }

    // Prune cache entries for files that no longer exist
    const fileSet = new Set(jsonlFiles)
    for (const cached of Object.keys(this.cache.files)) {
      if (!fileSet.has(cached)) {
        delete this.cache.files[cached]
      }
    }

    // Find files that need (re-)processing
    const toProcess: { filePath: string; mtime: number }[] = []
    for (const filePath of jsonlFiles) {
      try {
        const stat = fs.statSync(filePath)
        const mtime = stat.mtimeMs
        const existing = this.cache.files[filePath]
        if (!existing || existing.mtime !== mtime) {
          toProcess.push({ filePath, mtime })
        }
      } catch {
        // File disappeared between glob and stat
      }
    }

    // Process changed/new files with concurrency limit
    if (toProcess.length > 0) {
      const tasks = toProcess.map(({ filePath, mtime }) => async () => {
        try {
          const parsed = await parseJsonlFile(filePath)
          const summary = buildFileSummary(parsed, mtime)
          return { filePath, summary }
        } catch {
          return { filePath, summary: null }
        }
      })

      const results = await parallelLimit(tasks, 10)
      for (const { filePath, summary } of results) {
        if (summary) {
          this.cache.files[filePath] = summary
        }
      }

      this.saveCache()
    }

    // Merge all summaries
    this.cachedResult = mergeAllSummaries(this.cache.files)
    return this.cachedResult
  }
}

export const usageManager = new UsageManager()
