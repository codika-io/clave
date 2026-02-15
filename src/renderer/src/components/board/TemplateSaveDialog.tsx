import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '../../store/board-store'
import type { BoardTask } from '../../../../preload/index.d'

interface TemplateSaveDialogProps {
  isOpen: boolean
  onClose: () => void
  task: BoardTask | null
}

export function TemplateSaveDialog({ isOpen, onClose, task }: TemplateSaveDialogProps) {
  const addTemplate = useBoardStore((s) => s.addTemplate)
  const [name, setName] = useState('')
  const [includeCwd, setIncludeCwd] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && task) {
      setName(task.title)
      setIncludeCwd(!!task.cwd)
      setTimeout(() => inputRef.current?.select(), 50)
    }
  }, [isOpen, task])

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

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!name.trim() || !task) return
      addTemplate({
        name: name.trim(),
        title: task.title,
        prompt: task.prompt,
        cwd: includeCwd ? task.cwd : null
      })
      onClose()
    },
    [name, task, includeCwd, addTemplate, onClose]
  )

  return (
    <AnimatePresence>
      {isOpen && task && (
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
            className="fixed z-50 left-1/2 -translate-x-1/2 w-[380px]"
            style={{ top: '25%' }}
          >
            <form
              onSubmit={handleSubmit}
              className="bg-surface-100 rounded-xl border border-border shadow-2xl overflow-hidden"
            >
              <div className="px-5 pt-4 pb-3">
                <h2 className="text-sm font-semibold text-text-primary">Save as Template</h2>
              </div>

              <div className="px-5 space-y-3 pb-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Template name</label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Release, Bug fix..."
                    className="w-full h-8 px-3 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors"
                  />
                </div>

                {task.cwd && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCwd}
                      onChange={(e) => setIncludeCwd(e.target.checked)}
                      className="rounded border-border-subtle"
                    />
                    <span className="text-xs text-text-secondary">Include folder path</span>
                  </label>
                )}
              </div>

              <div className="px-5 py-3 border-t border-border-subtle flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-7 px-3 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="h-7 px-4 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
