// src/renderer/src/hooks/use-journal-session-sync.ts
import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store/session-store'
import { useAssistantStore } from '../store/assistant-store'

/** Strip XML-like tags (e.g. <local-command-stdout>...</local-command-stdout>) from text */
function stripXmlTags(text: string): string {
  return text.replace(/<\/?[a-zA-Z][a-zA-Z0-9_-]*>/g, '').trim()
}

// Track sessions with in-flight summarization to prevent double calls
const summarizingIds = new Set<string>()

/**
 * Subscribes to session store changes and updates the work journal:
 *
 * 1. New Claude-mode local session → add active entry to journal
 * 2. Session renamed → update entry name
 * 3. Session ends (alive: true → false) or removed → mark entry completed, fetch summary
 *
 * Startup sessions are skipped via initial snapshot pattern (same as board sync).
 */
export function useJournalSessionSync(): void {
  const prevSessionIdsRef = useRef<Set<string>>(new Set())
  const prevAliveRef = useRef<Map<string, boolean>>(new Map())
  const prevNamesRef = useRef<Map<string, string>>(new Map())
  const prevSessionDataRef = useRef<Map<string, { claudeSessionId: string | null; cwd: string }>>(
    new Map()
  )
  const enabled = useAssistantStore((s) => s.enabled)
  const loaded = useAssistantStore((s) => s.loaded)

  useEffect(() => {
    if (!enabled || !loaded) return

    // Build initial snapshot and add existing alive Claude sessions to journal
    const sessions = useSessionStore.getState().sessions
    const store = useAssistantStore.getState()
    const initialIds = new Set<string>()
    const initialAlive = new Map<string, boolean>()
    const initialNames = new Map<string, string>()
    const initialData = new Map<string, { claudeSessionId: string | null; cwd: string }>()
    for (const s of sessions) {
      initialIds.add(s.id)
      initialAlive.set(s.id, s.alive)
      initialNames.set(s.id, s.name)
      initialData.set(s.id, { claudeSessionId: s.claudeSessionId, cwd: s.cwd })
      // Add existing alive Claude sessions to journal (so enabling mid-session works)
      if (s.alive && s.claudeMode && s.sessionType === 'local') {
        store.addEntry(
          {
            sessionId: s.id,
            claudeSessionId: s.claudeSessionId ?? undefined,
            sessionName: s.name,
            startTime: Date.now(),
            status: 'active'
          },
          s.cwd
        )
      }
    }
    prevSessionIdsRef.current = initialIds
    prevAliveRef.current = initialAlive
    prevNamesRef.current = initialNames
    prevSessionDataRef.current = initialData

    const unsub = useSessionStore.subscribe((state) => {
      const store = useAssistantStore.getState()
      const prevIds = prevSessionIdsRef.current
      const prevAlive = prevAliveRef.current
      const prevNames = prevNamesRef.current

      for (const session of state.sessions) {
        // --- New session detection ---
        if (!prevIds.has(session.id)) {
          if (session.claudeMode && session.sessionType === 'local') {
            store.addEntry(
              {
                sessionId: session.id,
                claudeSessionId: session.claudeSessionId ?? undefined,
                sessionName: session.name,
                startTime: Date.now(),
                status: 'active'
              },
              session.cwd
            )
          }
        }

        // --- Session rename detection ---
        const prevName = prevNames.get(session.id)
        if (prevName !== undefined && prevName !== session.name) {
          store.updateEntryName(session.id, session.name)
        }

        // --- Session completion (alive: true → false) ---
        const wasAlive = prevAlive.get(session.id)
        if (wasAlive === true && session.alive === false) {
          fetchSummaryAndComplete(session.id, session.claudeSessionId, session.cwd)
        }
      }

      // --- Session removal (closed via X or exited) ---
      const currentIds = new Set(state.sessions.map((s) => s.id))
      const prevData = prevSessionDataRef.current
      for (const prevId of prevIds) {
        if (!currentIds.has(prevId)) {
          const data = prevData.get(prevId)
          if (data) {
            fetchSummaryAndComplete(prevId, data.claudeSessionId, data.cwd)
          } else {
            store.completeEntry(prevId)
          }
        }
      }

      // Update snapshots
      const newIds = new Set<string>()
      const newAlive = new Map<string, boolean>()
      const newNames = new Map<string, string>()
      const newData = new Map<string, { claudeSessionId: string | null; cwd: string }>()
      for (const s of state.sessions) {
        newIds.add(s.id)
        newAlive.set(s.id, s.alive)
        newNames.set(s.id, s.name)
        newData.set(s.id, { claudeSessionId: s.claudeSessionId, cwd: s.cwd })
      }
      prevSessionIdsRef.current = newIds
      prevAliveRef.current = newAlive
      prevNamesRef.current = newNames
      prevSessionDataRef.current = newData
    })

    return unsub
  }, [enabled, loaded])
}

async function fetchSummaryAndComplete(
  sessionId: string,
  claudeSessionId: string | null,
  cwd: string
): Promise<void> {
  // Prevent double summarization for the same session
  if (summarizingIds.has(sessionId)) return
  summarizingIds.add(sessionId)

  try {
    const store = useAssistantStore.getState()
    let summary: string | undefined

    // Try to find the session summary from Claude history
    if (claudeSessionId && window.electronAPI?.historyListProjects) {
      try {
        const projects = await window.electronAPI.historyListProjects()
        const project = projects.find((p) => cwd.startsWith(p.cwd))
        if (project) {
          const sessions = await window.electronAPI.historyLoadSessions(project.id)
          const match = sessions.find((s) => s.sessionId === claudeSessionId)
          if (match) {
            const raw = match.title || match.summary
            if (raw) {
              summary = stripXmlTags(raw)
            }
          }
        }
      } catch {
        // History fetch failed
      }
    }

    // Complete immediately with basic summary (sets endTime)
    store.completeEntry(sessionId, summary)

    // If AI summaries enabled, generate a better summary in the background
    const { aiSummaries } = store
    if (aiSummaries && claudeSessionId && window.electronAPI?.journalSummarize) {
      try {
        const aiSummary = await window.electronAPI.journalSummarize(claudeSessionId, cwd)
        if (aiSummary) {
          // Only update the summary, not endTime
          useAssistantStore.getState().updateEntrySummary(sessionId, aiSummary)
        }
      } catch {
        // AI summary failed — keep the basic summary
      }
    }
  } finally {
    summarizingIds.delete(sessionId)
  }
}
