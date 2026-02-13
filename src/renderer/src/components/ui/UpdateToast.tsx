import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function UpdateToast() {
  const [version, setVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.onUpdateDownloaded) return
    const cleanup = window.electronAPI.onUpdateDownloaded((v) => {
      setVersion(v)
      setDismissed(false)
    })
    return cleanup
  }, [])

  const visible = version !== null && !dismissed

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
          className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-surface-100 px-4 py-3 shadow-lg backdrop-blur-sm"
          style={{ maxWidth: 320 }}
        >
          {/* Icon */}
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent">
              <path
                d="M8 1v10M4 7l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 13h12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-text-primary leading-tight">
              New version available
            </p>
            <p className="text-[12px] text-text-tertiary mt-0.5">v{version}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setDismissed(true)}
              className="px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-200 transition-colors"
            >
              Later
            </button>
            <button
              onClick={() => window.electronAPI?.installUpdate()}
              className="px-3 py-1.5 text-[12px] font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors"
            >
              Update
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
