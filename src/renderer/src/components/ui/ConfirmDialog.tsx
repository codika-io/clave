import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfirmDialogProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  message: string
}

export function ConfirmDialog({ isOpen, onConfirm, onCancel, title, message }: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="fixed z-50 left-1/2 -translate-x-1/2 w-[400px]"
            style={{ top: '20%' }}
          >
            <div className="bg-surface-100 rounded-xl border border-border shadow-2xl overflow-hidden">
              <div className="px-5 pt-4 pb-2">
                <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
              </div>
              <div className="px-5 pb-4">
                <p className="text-xs text-text-secondary leading-relaxed">{message}</p>
              </div>
              <div className="px-5 py-3 border-t border-border-subtle flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="h-7 px-3 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className="h-7 px-4 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
