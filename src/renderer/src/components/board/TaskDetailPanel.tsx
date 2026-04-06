import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { useBoardStore } from '../../store/board-store'
import { TagInput } from './TagInput'
import { AttachmentList } from './AttachmentList'
import { useSessionStore } from '../../store/session-store'
import type { BoardTask, TaskAttachment } from '../../../../preload/index.d'
import { TaskHistorySection } from './TaskHistorySection'
import { useHistoryStore } from '../../store/history-store'

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
  onRunTask?: (task: BoardTask) => void
  onViewSession?: (sessionId: string) => void
}

export function TaskDetailPanel({ task, onClose, onRunTask, onViewSession }: TaskDetailPanelProps) {
  const updateTask = useBoardStore((s) => s.updateTask)
  const linkedSession = useSessionStore((s) =>
    task?.sessionId ? s.sessions.find((sess) => sess.id === task.sessionId) : undefined
  )
  const sessionAlive = linkedSession?.alive === true
  const activityStatus = linkedSession?.activityStatus ?? null
  const promptWaiting = linkedSession?.promptWaiting ?? null
  const canResume = (linkedSession != null && !sessionAlive) || (!linkedSession && !!task?.claudeSessionId)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cwd, setCwd] = useState('')
  const [dangerousMode, setDangerousMode] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNotes(task.notes)
      setPrompt(task.prompt)
      setCwd(task.cwd)
      setDangerousMode(task.dangerousMode)
      setTags(task.tags ?? [])
      setAttachments(task.attachments ?? [])
    }
  }, [task])

  const save = useCallback(() => {
    if (!task) return
    updateTask(task.id, {
      title: title.trim(),
      notes: notes.trim(),
      prompt: prompt.trim(),
      cwd: cwd.trim(),
      dangerousMode,
      tags,
      attachments
    })
  }, [task, title, notes, prompt, cwd, dangerousMode, tags, attachments, updateTask])

  const selectHistorySession = useHistoryStore((s) => s.selectSession)

  const handleBrowseHistory = useCallback(
    (historySession: import('../../store/history-store').HistorySession) => {
      save()
      onClose()
      selectHistorySession(historySession)
    },
    [save, onClose, selectHistorySession]
  )

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
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Notes
                  </label>
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
                    Prompt{' '}
                    <span className="font-normal text-text-tertiary">
                      (sent to Claude Code on run)
                    </span>
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

                {/* Attachments */}
                <AttachmentList
                  attachments={attachments}
                  onChange={(newAttachments) => {
                    setAttachments(newAttachments)
                    if (task) updateTask(task.id, { attachments: newAttachments })
                  }}
                />

                {/* Folder */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Folder
                  </label>
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
                    <span
                      className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${dangerousMode ? 'translate-x-[14px]' : ''}`}
                    />
                  </button>
                  <span
                    className={`text-xs transition-colors ${dangerousMode ? 'text-red-400' : 'text-text-secondary group-hover:text-text-primary'}`}
                  >
                    Skip permissions
                  </span>
                </label>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Tags
                  </label>
                  <TagInput
                    tags={tags}
                    onChange={(newTags) => {
                      setTags(newTags)
                      if (task) updateTask(task.id, { tags: newTags })
                    }}
                  />
                </div>

                {/* Session status & actions */}
                {task.sessionId && (
                  <div className="pt-3 border-t border-border-subtle">
                    <div className="flex items-center gap-2">
                      {sessionAlive && promptWaiting ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-xs text-amber-400">
                            {promptWaiting === 'is asking for permission'
                              ? 'Needs permission'
                              : 'Waiting for input'}
                          </span>
                        </>
                      ) : sessionAlive && activityStatus === 'active' ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-xs text-green-400">Working</span>
                        </>
                      ) : sessionAlive && activityStatus === 'idle' ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
                          <span className="text-xs text-blue-400">Idle</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-text-tertiary" />
                          <span className="text-xs text-text-tertiary">Session ended</span>
                        </>
                      )}

                      <div className="ml-auto flex items-center gap-2">
                        {linkedSession && (
                          <button
                            type="button"
                            onClick={() => {
                              save()
                              onClose()
                              onViewSession?.(task.sessionId!)
                            }}
                            className="h-7 px-3 rounded-lg text-xs font-medium bg-accent/10 hover:bg-accent/20 text-accent transition-colors flex items-center gap-1"
                          >
                            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                            View
                          </button>
                        )}
                        {canResume && onRunTask && (
                          <button
                            type="button"
                            onClick={() => {
                              save()
                              onClose()
                              onRunTask(task)
                            }}
                            className="h-7 px-3 rounded-lg text-xs font-medium bg-green-500/10 hover:bg-green-500/20 text-green-500 transition-colors flex items-center gap-1"
                          >
                            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                              <path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor" />
                            </svg>
                            Resume
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Run button for tasks without a session */}
                {!task.sessionId && task.prompt.trim() && onRunTask && (
                  <div className="pt-3 border-t border-border-subtle">
                    <button
                      type="button"
                      onClick={() => {
                        save()
                        onClose()
                        onRunTask(task)
                      }}
                      className="h-7 px-3 rounded-lg text-xs font-medium bg-green-500/10 hover:bg-green-500/20 text-green-500 transition-colors flex items-center gap-1"
                    >
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                        <path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor" />
                      </svg>
                      Run
                    </button>
                  </div>
                )}

                {/* History */}
                {task.claudeSessionId && (
                  <div className="pt-3 border-t border-border-subtle">
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      History
                    </label>
                    <TaskHistorySection
                      claudeSessionId={task.claudeSessionId}
                      onBrowseHistory={handleBrowseHistory}
                    />
                  </div>
                )}

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
