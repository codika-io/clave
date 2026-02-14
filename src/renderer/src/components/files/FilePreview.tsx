import { useState, useEffect, useCallback } from 'react'
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

export function FilePreview() {
  const previewFile = useSessionStore((s) => s.previewFile)
  const previewSource = useSessionStore((s) => s.previewSource)
  const setPreviewFile = useSessionStore((s) => s.setPreviewFile)
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const fileTreeOpen = useSessionStore((s) => s.fileTreeOpen)
  const fileTreeWidth = useSessionStore((s) => s.fileTreeWidth)

  const focusedSession = sessions.find((s) => s.id === focusedSessionId)
  const cwd = focusedSession?.cwd ?? null

  const [fileData, setFileData] = useState<FileReadResult | null>(null)
  const [loadError, setLoadError] = useState(false)

  const filename = previewFile?.split('/').pop() ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTS.has(ext)

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

  const { html, loading: highlightLoading } = useSyntaxHighlight(
    fileData?.binary ? null : (fileData?.content ?? null),
    filename
  )

  const close = useCallback(() => {
    setPreviewFile(null)
  }, [setPreviewFile])

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close])

  if (!previewFile) return null

  // Position: floating overlay to the left of the tree panel
  const rightOffset = previewSource === 'tree' && fileTreeOpen ? fileTreeWidth + 8 : 16

  return (
    <>
      {/* Click-outside backdrop (transparent) */}
      <div className="fixed inset-0 z-40" onClick={close} />

      <motion.div
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
        className="fixed z-50 w-[480px] bg-surface-50 border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          right: rightOffset,
          top: '10%',
          maxHeight: '70vh'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">{filename}</div>
            {previewFile !== filename && (
              <div className="text-xs text-text-tertiary truncate">{previewFile}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
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
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
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
          ) : highlightLoading || !html ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">Loading...</div>
          ) : (
            <div
              className="p-4 text-xs font-mono leading-relaxed overflow-x-auto [&_pre]:!bg-transparent [&_code]:!bg-transparent"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}

          {/* Truncation warning */}
          {fileData?.truncated && (
            <div className="px-4 py-1.5 text-xs text-yellow-500 bg-yellow-500/5 border-t border-border-subtle">
              File truncated at 1MB ({formatSize(fileData.size)} total)
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
