import { useState, useEffect, useCallback, useRef } from 'react'
import { useSyntaxHighlight } from '../../hooks/use-syntax-highlight'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { FileReadResult } from '../../../../preload/index.d'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'])
const MARKDOWN_EXTS = new Set(['md', 'mdx'])

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

interface FileContentRendererProps {
  filePath: string | null
  cwd: string | null
  className?: string
}

export function FileContentRenderer({ filePath, cwd, className }: FileContentRendererProps) {
  const [fileData, setFileData] = useState<FileReadResult | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filename = filePath?.split('/').pop() ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTS.has(ext)
  const isMarkdown = MARKDOWN_EXTS.has(ext)

  const isDirty = isEditing && editContent !== (fileData?.content ?? '')
  const canEdit = fileData && !fileData.binary && !fileData.truncated && !isImage && !loadError

  // Load file content
  useEffect(() => {
    if (!filePath || !cwd) {
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
        const result = await window.electronAPI?.readFile(cwd, filePath)
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
  }, [filePath, cwd, isImage])

  // Reset edit state when file changes
  useEffect(() => {
    setIsEditing(false)
    setEditContent('')
    setSaveError(null)
  }, [filePath])

  const { html, loading: highlightLoading } = useSyntaxHighlight(
    fileData?.binary ? null : (fileData?.content ?? null),
    filename
  )

  const enterEditMode = useCallback(() => {
    if (!fileData || fileData.binary) return
    setEditContent(fileData.content)
    setIsEditing(true)
    setSaveError(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [fileData])

  const discardEdit = useCallback(() => {
    setIsEditing(false)
    setEditContent('')
    setSaveError(null)
  }, [])

  const saveFile = useCallback(async () => {
    if (!filePath || !cwd || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await window.electronAPI?.writeFile(cwd, filePath, editContent)
      const result = await window.electronAPI?.readFile(cwd, filePath)
      if (result) setFileData(result)
      setIsEditing(false)
      setEditContent('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [filePath, cwd, editContent, saving])

  // Handle tab key in textarea
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const value = textarea.value
      const newValue = value.substring(0, start) + '  ' + value.substring(end)
      setEditContent(newValue)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      }, 0)
    }
  }, [])

  // Cmd+S handler
  useEffect(() => {
    if (!isEditing) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 's' && e.metaKey) {
        e.preventDefault()
        saveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, saveFile])

  if (!filePath) return null

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ''}`}>
      {/* Edit toolbar */}
      {(canEdit || isEditing) && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            {isDirty && (
              <span className="inline-block w-2 h-2 rounded-full bg-accent flex-shrink-0" title="Unsaved changes" />
            )}
            {isEditing && <span>Editing</span>}
          </div>
          <div className="flex items-center gap-1">
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
              <button
                onClick={enterEditMode}
                className="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {loadError ? (
          <div className="px-4 py-8 text-center text-sm text-text-tertiary">
            Failed to load file
          </div>
        ) : isImage ? (
          <div className="p-4 flex items-center justify-center">
            <img
              src={`file://${cwd}/${filePath}`}
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
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            spellCheck={false}
            className="w-full h-full p-4 bg-transparent text-xs font-mono leading-relaxed text-text-primary resize-none outline-none"
            style={{ tabSize: 2 }}
          />
        ) : isMarkdown && fileData?.content ? (
          <MarkdownRenderer content={fileData.content} />
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

      {/* Footer */}
      {fileData && !loadError && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-subtle text-[10px] text-text-tertiary flex-shrink-0">
          <span>{formatSize(fileData.size)}</span>
          {!fileData.binary && (
            <span>{countLines(isEditing ? editContent : fileData.content)} lines</span>
          )}
        </div>
      )}
    </div>
  )
}
