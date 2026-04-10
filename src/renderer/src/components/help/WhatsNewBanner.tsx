import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { navigateTo } from '../../lib/navigation'
import whatsNewData from '../../help/whats-new.json'

interface WhatsNewEntry {
  version: string
  title: string
  description: string
  action: { type: string; target: string }
}

const LAST_SEEN_KEY = 'clave-whats-new-last-seen-version'

export function WhatsNewBanner(): ReactNode {
  const [visible, setVisible] = useState(false)
  const [entry, setEntry] = useState<WhatsNewEntry | null>(null)
  const currentVersionRef = useRef<string | null>(null)

  useEffect(() => {
    async function check(): Promise<void> {
      try {
        const currentVersion = await window.electronAPI.getAppVersion()
        currentVersionRef.current = currentVersion
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY)

        // Don't show on fresh install (no last seen version)
        if (!lastSeen) {
          localStorage.setItem(LAST_SEEN_KEY, currentVersion)
          return
        }

        // Don't show if version hasn't changed
        if (lastSeen === currentVersion) return

        // Find entry for current version
        const match = (whatsNewData as WhatsNewEntry[]).find((e) => e.version === currentVersion)
        if (match) {
          setEntry(match)
          setVisible(true)
        } else {
          // No announcement for this version, just update last seen
          localStorage.setItem(LAST_SEEN_KEY, currentVersion)
        }
      } catch {
        // Silently fail if version check fails
      }
    }
    check()
  }, [])

  function dismiss(): void {
    setVisible(false)
    if (currentVersionRef.current) {
      localStorage.setItem(LAST_SEEN_KEY, currentVersionRef.current)
    }
  }

  function handleTryIt(): void {
    if (entry?.action.type === 'navigate') {
      navigateTo(entry.action.target)
    }
    dismiss()
  }

  if (!visible || !entry) return null

  return (
    <div
      className="mx-2 mb-1 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 flex items-center gap-2 text-xs"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <span className="text-text-secondary flex-1">
        <span className="font-medium text-text-primary">New in {entry.version}:</span> {entry.title}.{' '}
        {entry.description}
      </span>
      <button
        onClick={handleTryIt}
        className="text-accent hover:text-accent-hover font-medium whitespace-nowrap"
      >
        Try it
      </button>
      <button
        onClick={dismiss}
        className="p-0.5 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-secondary transition-colors"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
