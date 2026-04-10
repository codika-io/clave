import { useState, useEffect, useRef, type ReactNode } from 'react'
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline'
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
    <div>
      <div className="px-2.5 py-2 rounded-xl bg-accent/8 border border-accent/15">
        <div className="flex items-start gap-2">
          <SparklesIcon className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[12px] font-medium text-text-primary truncate">
                New in {entry.version}
              </span>
              <button
                onClick={dismiss}
                className="btn-icon btn-icon-xs flex-shrink-0"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
              {entry.title}. {entry.description}
            </p>
            <button
              onClick={handleTryIt}
              className="text-[11px] text-accent hover:text-accent-hover font-medium mt-1"
            >
              Try it
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
