import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '../../store/board-store'
import type { BoardTask } from '../../../../preload/index.d'

function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

interface TaskDetailPanelProps {
  task: BoardTask | null
  onClose: () => void
}

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const updateTask = useBoardStore((s) => s.updateTask)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cwd, setCwd] = useState('')
  const [dangerousMode, setDangerousMode] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNotes(task.notes)
      setPrompt(task.prompt)
      setCwd(task.cwd)
      setDangerousMode(task.dangerousMode)
    }
  }, [task])

  const save = useCallback(() => {
    if (!task) return
    updateTask(task.id, {
      title: title.trim(),
      notes: notes.trim(),
      prompt: prompt.trim(),
      cwd: cwd.trim(),
      dangerousMode
    })
  }, [task, title, notes, prompt, cwd, dangerousMode, updateTask])

  const handleBlur = useCallback(() => {
    save()
  }, [save])

  const handlePickFolder = useCallback(async () => {
    const folder = await window.electronAPI?.openFolderDialog()
    if (folder) {
      setCwd(folder)
      if (task) updateTask(task.id, { cwd: folder })
    }
  }, [task, updateTask])

  useEffect(() => {
    if (!task) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        save()
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [task, save, onClose])

  return (
    <AnimatePresence>
      {task && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={() => {
              save()
              onClose()
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="fixed z-50 left-1/2 -translate-x-1/2 w-[560px] max-h-[80vh] overflow-y-auto"
            style={{ top: '10%' }}
          >
            <div className="bg-surface-100 rounded-xl border border-border shadow-2xl overflow-hidden">
              <div className="px-5 pt-4 pb-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleBlur}
                  placeholder="Task title"
                  className="w-full text-base font-semibold text-text-primary bg-transparent outline-none placeholder:text-text-tertiary"
                />
              </div>

              <div className="px-5 space-y-4 pb-5">
                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Notes</label>
                  <textarea
                    ref={notesRef}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="Context, reasoning, acceptance criteria, links..."
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors resize-y"
                  />
                </div>

                {/* Prompt */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Prompt <span className="font-normal text-text-tertiary">(sent to Claude Code on run)</span>
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="Instructions for Claude Code..."
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg bg-surface-200 border-none text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors resize-y font-mono"
                  />
                </div>

                {/* Folder */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Folder</label>
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

                {/* Danger mode */}
                <label className="flex items-center gap-2 cursor-pointer group">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dangerousMode}
                    onClick={() => {
                      setDangerousMode(!dangerousMode)
                      if (task) updateTask(task.id, { dangerousMode: !dangerousMode })
                    }}
                    className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${dangerousMode ? 'bg-red-500' : 'bg-surface-300'}`}
                  >
                    <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${dangerousMode ? 'translate-x-[14px]' : ''}`} />
                  </button>
                  <span className={`text-xs transition-colors ${dangerousMode ? 'text-red-400' : 'text-text-secondary group-hover:text-text-primary'}`}>
                    Skip permissions
                  </span>
                </label>

                {/* Metadata */}
                <div className="pt-2 border-t border-border-subtle text-[11px] text-text-tertiary space-y-0.5">
                  <div>Created {formatFullDate(task.createdAt)}</div>
                  <div>Updated {formatFullDate(task.updatedAt)}</div>
                  {task.sessionId && <div>Linked session: {task.sessionId.slice(0, 8)}...</div>}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border-subtle flex justify-end">
                <button
                  onClick={() => {
                    save()
                    onClose()
                  }}
                  className="h-7 px-4 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
