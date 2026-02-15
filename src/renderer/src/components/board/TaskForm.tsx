import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '../../store/board-store'
import { TemplateManager } from './TemplateManager'

interface TaskFormProps {
  isOpen: boolean
  onClose: () => void
  editTask?: { id: string; title: string; prompt: string; cwd: string } | null
}

export function TaskForm({ isOpen, onClose, editTask }: TaskFormProps) {
  const addTask = useBoardStore((s) => s.addTask)
  const updateTask = useBoardStore((s) => s.updateTask)
  const templates = useBoardStore((s) => s.templates)

  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cwd, setCwd] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      if (editTask) {
        setTitle(editTask.title)
        setPrompt(editTask.prompt)
        setCwd(editTask.cwd)
      } else {
        setTitle('')
        setPrompt('')
        setCwd('')
      }
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [isOpen, editTask])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (managerOpen) {
          setManagerOpen(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, managerOpen, onClose])

  const handlePickFolder = useCallback(async () => {
    const folder = await window.electronAPI?.openFolderDialog()
    if (folder) setCwd(folder)
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!title.trim() || !cwd.trim()) return

      if (editTask) {
        updateTask(editTask.id, { title: title.trim(), prompt: prompt.trim(), cwd: cwd.trim() })
      } else {
        addTask({ title: title.trim(), prompt: prompt.trim(), cwd: cwd.trim() })
      }
      onClose()
    },
    [title, prompt, cwd, editTask, addTask, updateTask, onClose]
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
    <>
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
                  {/* Template chips — only shown when creating a new task */}
                  {!editTask && templates.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTitle(t.title)
                            setPrompt(t.prompt)
                            if (t.cwd) setCwd(t.cwd)
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors truncate max-w-[160px]"
                          title={t.name}
                        >
                          {t.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setManagerOpen(true)}
                        className="px-2 py-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
                      >
                        Manage
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Title</label>
                    <input
                      ref={titleRef}
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What needs to be done"
                      className="w-full h-8 px-3 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Prompt</label>
                    <textarea
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
                      disabled={!title.trim() || !cwd.trim()}
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

      <TemplateManager
        isOpen={managerOpen}
        onClose={() => setManagerOpen(false)}
      />
    </>
  )
}
