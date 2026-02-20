import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUpdaterStore } from '../../store/updater-store'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

export function UpdateOverlay() {
  const phase = useUpdaterStore((s) => s.phase)
  const version = useUpdaterStore((s) => s.version)
  const progress = useUpdaterStore((s) => s.progress)
  const errorMessage = useUpdaterStore((s) => s.errorMessage)
  const setProgress = useUpdaterStore((s) => s.setProgress)
  const setDownloaded = useUpdaterStore((s) => s.setDownloaded)
  const setDownloading = useUpdaterStore((s) => s.setDownloading)
  const setError = useUpdaterStore((s) => s.setError)
  const reset = useUpdaterStore((s) => s.reset)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Listen for download progress
  useEffect(() => {
    if (!window.electronAPI?.onDownloadProgress) return
    return window.electronAPI.onDownloadProgress((p) => {
      setProgress(p)
    })
  }, [setProgress])

  // Listen for download complete
  useEffect(() => {
    if (!window.electronAPI?.onUpdateDownloaded) return
    return window.electronAPI.onUpdateDownloaded(() => {
      setDownloaded()
    })
  }, [setDownloaded])

  // Listen for download error
  useEffect(() => {
    if (!window.electronAPI?.onDownloadError) return
    return window.electronAPI.onDownloadError((msg) => {
      setError(msg)
    })
  }, [setError])

  // Auto-restart when downloaded
  useEffect(() => {
    if (phase === 'downloaded') {
      restartTimerRef.current = setTimeout(() => {
        window.electronAPI?.installUpdate()
      }, 1500)
    }
    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    }
  }, [phase])

  const handleCancel = () => {
    window.electronAPI?.cancelDownload()
    reset()
  }

  const handleRetry = () => {
    setDownloading()
    window.electronAPI?.startDownload()
  }

  const visible = phase === 'downloading' || phase === 'downloaded' || phase === 'error'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface-0/80 backdrop-blur-xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
            className="flex flex-col items-center gap-8 w-80"
          >
            {/* Logo */}
            <motion.div
              animate={
                phase === 'downloaded'
                  ? { scale: [1, 1.05, 1], opacity: [1, 0.8, 1] }
                  : undefined
              }
              transition={
                phase === 'downloaded'
                  ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                  : undefined
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                className="w-16 h-16"
              >
                <path
                  d="M401,86 L191,86 A50,50 0 0 0 141,136 L141,336 A50,50 0 0 0 191,386 L401,386 L401,310 L242,310 A25,25 0 0 1 217,285 L217,187 A25,25 0 0 1 242,162 L401,162 Z"
                  fill="currentColor"
                  className="text-surface-300"
                />
                <path d="M158,119 L374,119 L401,86 L191,86 Z" className="text-surface-400" fill="currentColor" />
                <path d="M209,343 L374,343 L401,310 L242,310 Z" className="text-surface-400" fill="currentColor" />
                <path d="M368,343 L401,310 L401,386 L368,419 Z" className="text-surface-200" fill="currentColor" />
                <path d="M184,220 L217,187 L217,285 L184,318 Z" className="text-surface-200" fill="currentColor" />
                <path d="M368,119 L401,86 L401,162 L368,195 Z" className="text-surface-200" fill="currentColor" />
                <path
                  d="M371,116 L161,116 A50,50 0 0 0 111,166 L111,366 A50,50 0 0 0 161,416 L371,416 L371,340 L212,340 A25,25 0 0 1 187,315 L187,217 A25,25 0 0 1 212,192 L371,192 Z"
                  className="text-text-primary"
                  fill="currentColor"
                />
              </svg>
            </motion.div>

            {/* Status text */}
            <div className="text-center">
              {phase === 'downloading' && (
                <>
                  <p className="text-[15px] font-medium text-text-primary">
                    Updating to v{version}
                  </p>
                  <p className="text-[13px] text-text-tertiary mt-1">
                    {progress.total > 0
                      ? `${formatBytes(progress.transferred)} / ${formatBytes(progress.total)}`
                      : 'Starting download...'}
                    {progress.bytesPerSecond > 0 && (
                      <span className="ml-2">{formatSpeed(progress.bytesPerSecond)}</span>
                    )}
                  </p>
                </>
              )}
              {phase === 'downloaded' && (
                <>
                  <p className="text-[15px] font-medium text-text-primary">Restarting...</p>
                  <p className="text-[13px] text-text-tertiary mt-1">
                    v{version} is ready to go
                  </p>
                </>
              )}
              {phase === 'error' && (
                <>
                  <p className="text-[15px] font-medium text-text-primary">Update failed</p>
                  <p className="text-[13px] text-text-tertiary mt-1 max-w-[280px]">
                    {errorMessage || 'An unexpected error occurred'}
                  </p>
                </>
              )}
            </div>

            {/* Progress bar */}
            {(phase === 'downloading' || phase === 'downloaded') && (
              <div className="w-full">
                <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${phase === 'downloaded' ? 100 : progress.percent}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-[12px] text-text-tertiary mt-2 text-center">
                  {phase === 'downloaded' ? '100' : Math.round(progress.percent)}%
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              {phase === 'downloading' && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary rounded-lg border border-border hover:bg-surface-200 transition-colors"
                >
                  Cancel
                </button>
              )}
              {phase === 'error' && (
                <>
                  <button
                    onClick={reset}
                    className="px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary rounded-lg border border-border hover:bg-surface-200 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 text-[13px] font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
