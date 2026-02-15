import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '../../store/board-store'

interface TemplateManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function TemplateManager({ isOpen, onClose }: TemplateManagerProps) {
  const templates = useBoardStore((s) => s.templates)
  const deleteTemplate = useBoardStore((s) => s.deleteTemplate)

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

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
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="fixed z-50 left-1/2 -translate-x-1/2 w-[400px] max-h-[60vh]"
            style={{ top: '20%' }}
          >
            <div className="bg-surface-100 rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[60vh]">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">Manage Templates</h2>
                <button
                  onClick={onClose}
                  className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-200 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 pb-4">
                {templates.length === 0 ? (
                  <p className="text-xs text-text-tertiary py-4 text-center">
                    No templates yet. Right-click a task and select "Save as Template" to create one.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {templates.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-200 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-text-primary truncate">{t.name}</div>
                          <div className="text-[11px] text-text-tertiary truncate">{t.title}</div>
                        </div>
                        <button
                          onClick={() => deleteTemplate(t.id)}
                          className="flex-shrink-0 p-1.5 rounded-md text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete template"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 4h9M5 4V2.5h4V4M3.5 4v7.5h7V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
