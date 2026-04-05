// src/renderer/src/hooks/use-journal-persistence.ts
import { useEffect } from 'react'
import { useAssistantStore } from '../store/assistant-store'

export function useJournalPersistence(): void {
  const loaded = useAssistantStore((s) => s.loaded)
  const enabled = useAssistantStore((s) => s.enabled)
  const loadJournal = useAssistantStore((s) => s.loadJournal)

  useEffect(() => {
    if (enabled && !loaded) {
      loadJournal()
    }
  }, [enabled, loaded, loadJournal])
}
