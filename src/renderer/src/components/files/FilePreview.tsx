import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { useSessionStore } from '../../store/session-store'
import { useSyntaxHighlight } from '../../hooks/use-syntax-highlight'
import type { FileReadResult } from '../../../../preload/index.d'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'])

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

export function FilePreview() {
  const previewFile = useSessionStore((s) => s.previewFile)
  const previewCwd = useSessionStore((s) => s.previewCwd)
  const previewSource = useSessionStore((s) => s.previewSource)
  const setPreviewFile = useSessionStore((s) => s.setPreviewFile)
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const fileTreeOpen = useSessionStore((s) => s.fileTreeOpen)
  const fileTreeWidth = useSessionStore((s) => s.fileTreeWidth)

  const focusedSession = sessions.find((s) => s.id === focusedSessionId)
  const cwd = previewCwd ?? focusedSession?.cwd ?? null

  const [fileData, setFileData] = useState<FileReadResult | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filename = previewFile?.split('/').pop() ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTS.has(ext)

  const isDirty = isEditing && editContent !== (fileData?.content ?? '')
  const canEdit = fileData && !fileData.binary && !fileData.truncated && !isImage && !loadError

  // Load file content
  useEffect(() => {
    if (!previewFile || !cwd) {
      setFileData(null)
      setLoadError(false)
      return
    }

    if (isImage) {
      setFileData(null)
      return
    }

    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const result = await window.electronAPI?.readFile(cwd, previewFile)
        if (cancelled || !result) return
        setFileData(result)
        setLoadError(false)
      } catch {
        if (!cancelled) setLoadError(true)
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [previewFile, cwd, isImage])

  // Reset edit state when file changes
  useEffect(() => {
    setIsEditing(false)
    setEditContent('')
    setSaveError(null)
  }, [previewFile])

  const { html, loading: highlightLoading } = useSyntaxHighlight(
    fileData?.binary ? null : (fileData?.content ?? null),
    filename
  )

  const enterEditMode = useCallback(() => {
    if (!fileData || fileData.binary) return
    setEditContent(fileData.content)
    setIsEditing(true)
    setSaveError(null)
    // Focus textarea after state update
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [fileData])

  const discardEdit = useCallback(() => {
    setIsEditing(false)
    setEditContent('')
    setSaveError(null)
  }, [])

  const saveFile = useCallback(async () => {
    if (!previewFile || !cwd || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await window.electronAPI?.writeFile(cwd, previewFile, editContent)
      // Reload file data after save
      const result = await window.electronAPI?.readFile(cwd, previewFile)
      if (result) setFileData(result)
      setIsEditing(false)
      setEditContent('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [previewFile, cwd, editContent, saving])

  const close = useCallback(() => {
    setPreviewFile(null)
  }, [setPreviewFile])

  const handleClose = useCallback(() => {
    if (isDirty) {
      // If dirty, exit edit mode instead of closing
      discardEdit()
    } else if (isEditing) {
      discardEdit()
    } else {
      close()
    }
  }, [isDirty, isEditing, discardEdit, close])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }
      // Cmd+S to save when editing
      if (isEditing && e.key === 's' && e.metaKey) {
        e.preventDefault()
        saveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose, isEditing, saveFile])

  // Handle tab key in textarea (insert spaces instead of focus trap)
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const value = textarea.value
      const newValue = value.substring(0, start) + '  ' + value.substring(end)
      setEditContent(newValue)
      // Restore cursor position after React re-render
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      }, 0)
    }
  }, [])

  if (!previewFile) return null

  // Position: floating overlay to the left of the tree panel
  const rightOffset = previewSource === 'tree' && fileTreeOpen ? fileTreeWidth + 8 : 16
  const panelWidth = isEditing ? 560 : 480

  return (
    <>
      {/* Click-outside backdrop (transparent) */}
      <div className="fixed inset-0 z-40" onClick={handleClose} />

      <motion.div
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0, width: panelWidth }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
        className="fixed z-50 bg-surface-50 border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          right: rightOffset,
          top: '10%',
          maxHeight: '75vh',
          width: panelWidth
        }}
      >
        {/* Edit mode accent bar */}
        {isEditing && (
          <div className="h-0.5 bg-accent flex-shrink-0" />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle flex-shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
                {filename}
                {isDirty && (
                  <span className="inline-block w-2 h-2 rounded-full bg-accent flex-shrink-0" title="Unsaved changes" />
                )}
              </div>
              {previewFile !== filename && (
                <div className="text-xs text-text-tertiary truncate">{previewFile}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {isEditing ? (
              <>
                <button
                  onClick={discardEdit}
                  className="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={saveFile}
                  disabled={saving || !isDirty}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                {canEdit && (
                  <button
                    onClick={enterEditMode}
                    className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors"
                    title="Edit file"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      <path d="M7 3L9 5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => navigator.clipboard.writeText(`./${previewFile}`)}
                  className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors"
                  title="Copy path"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M8.5 3.5V2C8.5 1.45 8.05 1 7.5 1H2C1.45 1 1 1.45 1 2V7.5C1 8.05 1.45 8.5 2 8.5H3.5" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </button>
                <button
                  onClick={close}
                  className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0">
          {loadError ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              Failed to load file
            </div>
          ) : isImage ? (
            <div className="p-4 flex items-center justify-center">
              <img
                src={`file://${cwd}/${previewFile}`}
                alt={filename}
                className="max-w-full max-h-[50vh] object-contain rounded"
              />
            </div>
          ) : fileData?.binary ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              Binary file &mdash; cannot preview
              <div className="mt-1 text-xs">{formatSize(fileData.size)}</div>
            </div>
          ) : fileData && fileData.size > 1024 * 1024 ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              File too large to preview
              <div className="mt-1 text-xs">{formatSize(fileData.size)}</div>
            </div>
          ) : isEditing ? (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                spellCheck={false}
                className="flex-1 w-full p-4 bg-transparent text-xs font-mono leading-relaxed text-text-primary resize-none outline-none min-h-[200px]"
                style={{ tabSize: 2 }}
              />
            </div>
          ) : highlightLoading || !html ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">Loading...</div>
          ) : (
            <div
              className="p-4 text-xs font-mono leading-relaxed overflow-x-auto [&_pre]:!bg-transparent [&_code]:!bg-transparent"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}

          {/* Save error */}
          {saveError && (
            <div className="px-4 py-1.5 text-xs text-red-400 bg-red-500/5 border-t border-border-subtle">
              {saveError}
            </div>
          )}

          {/* Truncation warning */}
          {fileData?.truncated && (
            <div className="px-4 py-1.5 text-xs text-yellow-500 bg-yellow-500/5 border-t border-border-subtle">
              File truncated at 1MB ({formatSize(fileData.size)} total)
            </div>
          )}
        </div>

        {/* Footer — file info */}
        {fileData && !loadError && (
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-subtle text-[10px] text-text-tertiary flex-shrink-0">
            <span>{formatSize(fileData.size)}</span>
            {!fileData.binary && (
              <span>{countLines(isEditing ? editContent : fileData.content)} lines</span>
            )}
          </div>
        )}
      </motion.div>
    </>
  )
}
