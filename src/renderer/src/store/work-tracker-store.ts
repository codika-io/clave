// src/renderer/src/store/work-tracker-store.ts
import { create } from 'zustand'
import { useEffect, useRef } from 'react'
import { useSessionStore } from './session-store'

interface TrackedSession {
  sessionId: string
  cwd: string
  projectName: string
  dateKey: string // local YYYY-MM-DD when session started
  startedAt: number
  endedAt: number | null
  lastTickAt: number // last time tick() updated this session
  accumulatedMs: number
}

interface ProjectSummary {
  projectPath: string
  projectName: string
  totalMinutes: number
  sessionCount: number
}

interface YesterdaySummary {
  totalMinutes: number
  sessionCount: number
}

interface WeeklySummary {
  dailyMinutes: number[] // 7 entries, Mon–Sun
  totalSessions: number
  avgDailyMinutes: number
}

interface TokenUsage {
  todayTokens: number
  todayCost: number
  weekTokens: number
  weekCost: number
}

type BreakSuggestion = 'none' | 'gentle' | 'strong'

interface WorkTrackerState {
  // Tracked sessions (current app lifecycle)
  trackedSessions: TrackedSession[]

  // Streak
  currentStreakStartedAt: number | null
  lastActivityAt: number | null
  breakSuggestion: BreakSuggestion

  // Aggregated today
  todayProjects: ProjectSummary[]
  todayTotalMinutes: number
  todaySessionCount: number

  // Historical
  yesterdaySummary: YesterdaySummary | null
  weeklySummary: WeeklySummary | null
  tokenUsage: TokenUsage | null

  // UI
  enabled: boolean
  isExpanded: boolean

  // Actions
  setEnabled: (enabled: boolean) => void
  toggleExpanded: () => void
  trackSession: (sessionId: string, cwd: string) => void
  endSession: (sessionId: string) => void
  tick: () => void
  updateHistoricalData: (usage: unknown) => void
}

const GENTLE_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2 hours
const STRONG_THRESHOLD_MS = 4 * 60 * 60 * 1000 // 4 hours
const BREAK_GAP_MS = 15 * 60 * 1000 // 15 minutes inactivity = break

function getProjectName(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() || cwd
}

/** Returns YYYY-MM-DD in local timezone */
function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function computeBreakSuggestion(streakMs: number): BreakSuggestion {
  if (streakMs >= STRONG_THRESHOLD_MS) return 'strong'
  if (streakMs >= GENTLE_THRESHOLD_MS) return 'gentle'
  return 'none'
}

function aggregateProjects(sessions: TrackedSession[]): ProjectSummary[] {
  const map = new Map<string, { totalMs: number; count: number }>()

  for (const s of sessions) {
    const totalMs = s.accumulatedMs
    const existing = map.get(s.cwd)
    if (existing) {
      existing.totalMs += totalMs
      existing.count += 1
    } else {
      map.set(s.cwd, { totalMs, count: 1 })
    }
  }

  return Array.from(map.entries())
    .map(([cwd, { totalMs, count }]) => ({
      projectPath: cwd,
      projectName: getProjectName(cwd),
      totalMinutes: Math.round(totalMs / 60000),
      sessionCount: count
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
}

export const useWorkTrackerStore = create<WorkTrackerState>((set, get) => ({
  trackedSessions: [],
  currentStreakStartedAt: null,
  lastActivityAt: null,
  breakSuggestion: 'none',
  todayProjects: [],
  todayTotalMinutes: 0,
  todaySessionCount: 0,
  yesterdaySummary: null,
  weeklySummary: null,
  tokenUsage: null,
  enabled: localStorage.getItem('clave-work-tracker-enabled') !== 'false',
  isExpanded: false,

  setEnabled: (enabled) => {
    localStorage.setItem('clave-work-tracker-enabled', String(enabled))
    set({ enabled })
  },
  toggleExpanded: () => set((s) => ({ isExpanded: !s.isExpanded })),

  trackSession: (sessionId, cwd) =>
    set((state) => {
      if (state.trackedSessions.some((s) => s.sessionId === sessionId)) return {}
      const now = Date.now()
      return {
        trackedSessions: [
          ...state.trackedSessions,
          {
            sessionId,
            cwd,
            projectName: getProjectName(cwd),
            dateKey: getLocalDateString(),
            startedAt: now,
            endedAt: null,
            lastTickAt: now,
            accumulatedMs: 0
          }
        ],
        currentStreakStartedAt: state.currentStreakStartedAt ?? now,
        lastActivityAt: now
      }
    }),

  endSession: (sessionId) =>
    set((state) => {
      const now = Date.now()
      return {
        trackedSessions: state.trackedSessions.map((s) => {
          if (s.sessionId !== sessionId || s.endedAt) return s
          // Final accumulation: add time since last tick
          const delta = now - s.lastTickAt
          return { ...s, endedAt: now, lastTickAt: now, accumulatedMs: s.accumulatedMs + delta }
        })
      }
    }),

  tick: () => {
    const state = get()
    const now = Date.now()
    const todayKey = getLocalDateString()
    const storeSessions = useSessionStore.getState().sessions

    // Update accumulated time for live sessions (only active time counts)
    const updatedTracked = state.trackedSessions.map((ts) => {
      if (ts.endedAt) return ts
      const storeSession = storeSessions.find((s) => s.id === ts.sessionId)
      if (!storeSession || !storeSession.alive) {
        // Session ended between ticks — finalize
        return { ...ts, endedAt: now, lastTickAt: now }
      }
      // Only accumulate time when session is actively working
      if (storeSession.activityStatus === 'active') {
        const delta = now - ts.lastTickAt
        return { ...ts, lastTickAt: now, accumulatedMs: ts.accumulatedMs + delta }
      }
      // Session alive but idle — advance lastTickAt without accumulating
      return { ...ts, lastTickAt: now }
    })

    // Check if any session is active
    const hasActiveSession = storeSessions.some(
      (s) => s.alive && s.activityStatus === 'active'
    )

    // Streak logic
    let { currentStreakStartedAt, lastActivityAt } = state
    if (hasActiveSession) {
      lastActivityAt = now
      if (!currentStreakStartedAt) currentStreakStartedAt = now
    } else if (lastActivityAt && now - lastActivityAt > BREAK_GAP_MS) {
      currentStreakStartedAt = null
      lastActivityAt = null
    }

    const streakMs = currentStreakStartedAt ? now - currentStreakStartedAt : 0
    const breakSuggestion = computeBreakSuggestion(streakMs)

    // Aggregate only today's sessions
    const todaySessions = updatedTracked.filter((s) => s.dateKey === todayKey)
    const todayProjects = aggregateProjects(todaySessions)
    const todayTotalMinutes = todayProjects.reduce((sum, p) => sum + p.totalMinutes, 0)
    const todaySessionCount = todaySessions.length

    set({
      trackedSessions: updatedTracked,
      currentStreakStartedAt,
      lastActivityAt,
      breakSuggestion,
      todayProjects,
      todayTotalMinutes,
      todaySessionCount
    })
  },

  updateHistoricalData: (usage: unknown) => {
    const data = usage as {
      dailyActivity?: {
        date: string
        messageCount: number
        sessionCount: number
        toolCallCount: number
      }[]
      dailyModelTokens?: { date: string; tokensByModel: Record<string, number> }[]
      estimatedCost?: number
      totalTokens?: number
    }
    if (!data.dailyActivity) return

    const nowDate = new Date()
    const today = getLocalDateString(nowDate)
    const yesterdayDate = new Date(nowDate)
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterday = getLocalDateString(yesterdayDate)

    // Build week dates starting from Monday (all in local time)
    const mondayOffset = (nowDate.getDay() + 6) % 7
    const mondayDate = new Date(nowDate)
    mondayDate.setDate(mondayDate.getDate() - mondayOffset)
    mondayDate.setHours(0, 0, 0, 0)

    const weekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(mondayDate)
      d.setDate(d.getDate() + i)
      weekDates.push(getLocalDateString(d))
    }

    const activityByDate = new Map(data.dailyActivity.map((d) => [d.date, d]))

    // Yesterday summary
    const yesterdayActivity = activityByDate.get(yesterday)
    const yesterdaySummary: YesterdaySummary | null = yesterdayActivity
      ? {
          // Rough estimate: ~2 min per message exchange. Not actual tracked time.
          totalMinutes: yesterdayActivity.messageCount * 2,
          sessionCount: yesterdayActivity.sessionCount
        }
      : null

    // Weekly summary — use live tracked minutes for today, heuristic for past days
    const { todayTotalMinutes } = get()
    const todayIndex = weekDates.indexOf(today)
    const dailyMinutes = weekDates.map((date, i) => {
      if (i === todayIndex) return todayTotalMinutes
      const activity = activityByDate.get(date)
      // Rough estimate: ~2 min per message exchange
      return activity ? activity.messageCount * 2 : 0
    })
    const activeDays = dailyMinutes.filter((m) => m > 0).length
    const totalWeekMinutes = dailyMinutes.reduce((a, b) => a + b, 0)
    const weeklySummary: WeeklySummary = {
      dailyMinutes,
      totalSessions: weekDates.reduce((sum, date) => {
        const a = activityByDate.get(date)
        return sum + (a ? a.sessionCount : 0)
      }, 0),
      avgDailyMinutes: activeDays > 0 ? Math.round(totalWeekMinutes / activeDays) : 0
    }

    // Token usage
    const tokensByDate = new Map(
      (data.dailyModelTokens || []).map((d) => [
        d.date,
        Object.values(d.tokensByModel).reduce((a, b) => a + b, 0)
      ])
    )

    const todayTokens = tokensByDate.get(today) || 0
    const weekTokens = weekDates.reduce((sum, date) => sum + (tokensByDate.get(date) || 0), 0)

    const totalTokens = data.totalTokens || 1
    const totalCost = data.estimatedCost || 0
    const costPerToken = totalTokens > 0 ? totalCost / totalTokens : 0

    const tokenUsage: TokenUsage = {
      todayTokens,
      todayCost: Math.round(todayTokens * costPerToken * 100) / 100,
      weekTokens,
      weekCost: Math.round(weekTokens * costPerToken * 100) / 100
    }

    set({ yesterdaySummary, weeklySummary, tokenUsage })
  }
}))

/**
 * Mount once in AppShell. Syncs session-store sessions into work tracker,
 * runs a 30s tick for duration/streak updates, and refreshes historical
 * data every 10 minutes.
 */
export function useWorkTracker(): void {
  const prevSessionIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Sync existing alive sessions on mount
    const sessions = useSessionStore.getState().sessions
    for (const s of sessions) {
      if (s.alive) {
        useWorkTrackerStore.getState().trackSession(s.id, s.cwd)
      }
    }

    // Subscribe to session-store for new/ended sessions
    let prevSessionRef = useSessionStore.getState().sessions
    const unsubscribe = useSessionStore.subscribe((state) => {
      // Skip if sessions array hasn't changed (avoids reacting to theme/layout changes)
      if (state.sessions === prevSessionRef) return
      prevSessionRef = state.sessions

      const currentIds = new Set<string>(state.sessions.filter((s) => s.alive).map((s) => s.id))
      const tracker = useWorkTrackerStore.getState()

      // New sessions
      for (const s of state.sessions) {
        if (s.alive && !prevSessionIds.current.has(s.id)) {
          tracker.trackSession(s.id, s.cwd)
        }
      }

      // Ended sessions
      for (const id of prevSessionIds.current) {
        if (!currentIds.has(id)) {
          tracker.endSession(id)
        }
      }

      prevSessionIds.current = currentIds
    })

    // 30-second tick for duration & streak
    const tickInterval = setInterval(() => {
      useWorkTrackerStore.getState().tick()
    }, 30000)

    // Run first tick immediately
    useWorkTrackerStore.getState().tick()

    // Fetch historical data
    const fetchHistorical = async () => {
      try {
        if (!window.electronAPI?.getUsageStats) return
        const stats = await window.electronAPI.getUsageStats()
        useWorkTrackerStore.getState().updateHistoricalData(stats)
      } catch {
        // Usage stats may not be available — ignore
      }
    }

    fetchHistorical()
    const historicalInterval = setInterval(fetchHistorical, 10 * 60 * 1000)

    return () => {
      unsubscribe()
      clearInterval(tickInterval)
      clearInterval(historicalInterval)
    }
  }, [])
}
