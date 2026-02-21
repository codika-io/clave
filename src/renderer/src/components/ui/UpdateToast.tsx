import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUpdaterStore } from '../../store/updater-store'

export function UpdateToast() {
  const phase = useUpdaterStore((s) => s.phase)
  const version = useUpdaterStore((s) => s.version)
  const dismissed = useUpdaterStore((s) => s.dismissed)
  const setAvailable = useUpdaterStore((s) => s.setAvailable)
  const setDownloading = useUpdaterStore((s) => s.setDownloading)
  const dismiss = useUpdaterStore((s) => s.dismiss)
  const undismiss = useUpdaterStore((s) => s.undismiss)

  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable) return
    return window.electronAPI.onUpdateAvailable((v) => {
      setAvailable(v)
    })
  }, [setAvailable])

  const handleUpdate = () => {
    setDownloading()
    window.electronAPI?.startDownload()
  }

  const visible = phase === 'available' && !dismissed

  return (
    <>
      {/* Full toast */}
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
              <p className="text-[12px] text-text-tertiary mt-0.5">{version ? `v${version}` : 'New version'}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={dismiss}
                className="px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-200 transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleUpdate}
                className="px-3 py-1.5 text-[12px] font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors"
              >
                Update
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restore button (shown when toast is dismissed) */}
      <AnimatePresence>
        {dismissed && version !== null && phase === 'available' && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            onClick={undismiss}
            className="fixed bottom-4 left-4 z-50 flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-surface-100 shadow-md backdrop-blur-sm text-accent hover:bg-surface-200 transition-colors"
            title={`Update available${version ? `: v${version}` : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
