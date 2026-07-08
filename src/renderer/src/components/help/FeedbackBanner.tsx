import { useState, useEffect, type ReactNode } from 'react'
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { TalkToUsDialog } from './TalkToUsDialog'

/**
 * Invitation to talk to us, shown in the sidebar's announcements slot.
 *
 * Starts expanded. Once collapsed — by the user, or by booking/sending — it
 * never expands again: only the one-line pill remains, so the door stays open
 * without nagging. Unlike TelemetryNoticeBanner this is not gated on
 * `telemetryEnabled`: opting out of the anonymous ping says nothing about
 * whether someone wants to talk to us.
 */
export function FeedbackBanner(): ReactNode {
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check(): Promise<void> {
      try {
        const state = await window.electronAPI.feedbackGetState()
        if (!cancelled) setCollapsed(state.collapsed)
      } catch {
        // Silently fail — never block the sidebar on feedback state
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  function collapse(): void {
    setCollapsed(true)
    window.electronAPI?.feedbackSetCollapsed()
  }

  // null while loading: render nothing rather than flashing the expanded card.
  if (collapsed === null) return null

  return (
    <>
      {collapsed ? (
        <button
          onClick={() => setDialogOpen(true)}
          className="sidebar-item w-full text-[11px] text-text-tertiary hover:text-text-secondary"
        >
          <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Give us feedback</span>
        </button>
      ) : (
        // The card needs breathing room the footer's 2px row rhythm doesn't give it.
        <div className="px-2.5 py-2 mb-1.5 rounded-xl bg-accent/8 border border-accent/15">
          <div className="flex items-start gap-2">
            <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12px] font-medium text-text-primary">
                  Help us make Clave better
                </span>
                <button
                  onClick={collapse}
                  aria-label="Collapse"
                  className="btn-icon btn-icon-xs -mr-1 -mt-0.5"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                Clave has no accounts, so we don&apos;t know who uses it. We&apos;d love to talk to
                the people who do, so we can build the right things.
              </p>
              <button
                onClick={() => setDialogOpen(true)}
                className="text-[11px] text-accent hover:text-accent-hover font-medium mt-1"
              >
                Talk to us
              </button>
            </div>
          </div>
        </div>
      )}

      <TalkToUsDialog open={dialogOpen} onOpenChange={setDialogOpen} onEngaged={collapse} />
    </>
  )
}
