import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '../../store/board-store'

interface TaskFormProps {
  isOpen: boolean
  onClose: () => void
  editTask?: { id: string; title: string; prompt: string; cwd: string; dangerousMode: boolean } | null
}

export function TaskForm({ isOpen, onClose, editTask }: TaskFormProps) {
  const addTask = useBoardStore((s) => s.addTask)
  const updateTask = useBoardStore((s) => s.updateTask)

  const [prompt, setPrompt] = useState('')
  const [cwd, setCwd] = useState('')
  const [dangerousMode, setDangerousMode] = useState(false)
  const [title, setTitle] = useState('')
  const promptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) {
      if (editTask) {
        setPrompt(editTask.prompt)
        setCwd(editTask.cwd)
        setDangerousMode(editTask.dangerousMode)
        setTitle(editTask.title)
      } else {
        setPrompt('')
        setCwd('')
        setDangerousMode(false)
        setTitle('')
      }
      setTimeout(() => promptRef.current?.focus(), 50)
    }
  }, [isOpen, editTask])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handlePickFolder = useCallback(async () => {
    const folder = await window.electronAPI?.openFolderDialog()
    if (folder) setCwd(folder)
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!prompt.trim() || !cwd.trim()) return

      if (editTask) {
        updateTask(editTask.id, { title: title.trim(), prompt: prompt.trim(), cwd: cwd.trim(), dangerousMode })
      } else {
        addTask({ title: title.trim(), prompt: prompt.trim(), cwd: cwd.trim(), dangerousMode })
      }
      onClose()
    },
    [title, prompt, cwd, dangerousMode, editTask, addTask, updateTask, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        handleSubmit(e as unknown as React.FormEvent)
      }
    },
    [handleSubmit]
  )

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
              className="fixed z-50 left-1/2 -translate-x-1/2 w-[480px]"
              style={{ top: '20%' }}
            >
              <form
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
                className="bg-surface-100 rounded-xl border border-border shadow-2xl overflow-hidden"
              >
                <div className="px-5 pt-4 pb-3">
                  <h2 className="text-sm font-semibold text-text-primary">
                    {editTask ? 'Edit Task' : 'New Task'}
                  </h2>
                </div>

                <div className="px-5 space-y-3 pb-4">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Prompt</label>
                    <textarea
                      ref={promptRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Instructions for Claude Code..."
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors resize-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Folder</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cwd}
                        readOnly
                        placeholder="Select a folder..."
                        className="flex-1 h-8 px-3 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none cursor-default truncate"
                      />
                      <button
                        type="button"
                        onClick={handlePickFolder}
                        className="h-8 px-3 rounded-lg bg-surface-200 hover:bg-surface-300 text-text-secondary hover:text-text-primary text-xs font-medium transition-colors flex-shrink-0"
                      >
                        Browse
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer group">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={dangerousMode}
                      onClick={() => setDangerousMode(!dangerousMode)}
                      className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${dangerousMode ? 'bg-red-500' : 'bg-surface-300'}`}
                    >
                      <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${dangerousMode ? 'translate-x-[14px]' : ''}`} />
                    </button>
                    <span className={`text-xs transition-colors ${dangerousMode ? 'text-red-400' : 'text-text-secondary group-hover:text-text-primary'}`}>
                      Skip permissions
                    </span>
                  </label>

                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Title (optional)</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Short label for the task"
                      className="w-full h-8 px-3 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors"
                    />
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between">
                  <span className="text-[11px] text-text-tertiary">
                    <kbd className="px-1 py-0.5 rounded bg-surface-200 text-text-secondary">Cmd+Enter</kbd> submit
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="h-7 px-3 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!prompt.trim() || !cwd.trim()}
                      className="h-7 px-4 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {editTask ? 'Save' : 'Create'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
  )
}
