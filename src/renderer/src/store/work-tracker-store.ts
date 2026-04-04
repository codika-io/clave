// src/renderer/src/store/work-tracker-store.ts
import { create } from 'zustand'
import { useSessionStore } from './session-store'

interface TrackedSession {
  sessionId: string
  cwd: string
  projectName: string
  startedAt: number
  endedAt: number | null
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
  topProjects: string[]
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
  isExpanded: boolean

  // Actions
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

function computeBreakSuggestion(streakMs: number): BreakSuggestion {
  if (streakMs >= STRONG_THRESHOLD_MS) return 'strong'
  if (streakMs >= GENTLE_THRESHOLD_MS) return 'gentle'
  return 'none'
}

function aggregateProjects(sessions: TrackedSession[]): ProjectSummary[] {
  const now = Date.now()
  const map = new Map<string, { totalMs: number; count: number }>()

  for (const s of sessions) {
    // accumulatedMs is kept up-to-date by tick() for live sessions,
    // but between ticks we compute the live delta for accuracy
    const totalMs = s.endedAt ? s.accumulatedMs : now - s.startedAt
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
  isExpanded: false,

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
            startedAt: now,
            endedAt: null,
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
        trackedSessions: state.trackedSessions.map((s) =>
          s.sessionId === sessionId && !s.endedAt
            ? { ...s, endedAt: now, accumulatedMs: now - s.startedAt }
            : s
        )
      }
    }),

  tick: () => {
    const state = get()
    const now = Date.now()
    const storeSessions = useSessionStore.getState().sessions

    // Update accumulated time for live sessions
    const updatedTracked = state.trackedSessions.map((ts) => {
      if (ts.endedAt) return ts
      const storeSession = storeSessions.find((s) => s.id === ts.sessionId)
      if (!storeSession || !storeSession.alive) {
        return { ...ts, endedAt: now, accumulatedMs: now - ts.startedAt }
      }
      return { ...ts, accumulatedMs: now - ts.startedAt }
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
    }

    const streakMs = currentStreakStartedAt ? now - currentStreakStartedAt : 0
    const breakSuggestion = computeBreakSuggestion(streakMs)

    // Aggregate
    const todayProjects = aggregateProjects(updatedTracked)
    const todayTotalMinutes = todayProjects.reduce((sum, p) => sum + p.totalMinutes, 0)
    const todaySessionCount = updatedTracked.length

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

  updateHistoricalData: (_usage: unknown) => {
    // Will be implemented in Task 2
  }
}))
