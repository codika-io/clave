import { useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { useSessionStore } from '../../store/session-store'
import { FileContent } from './FileContent'
import { useFileEditor } from '../../hooks/use-file-editor'
import { canOpenExternally as canOpenExternallyExt, formatSize, countLines } from './file-types'
import {
  DocumentDuplicateIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  WindowIcon
} from '@heroicons/react/24/outline'
import { fileActionButtonClass } from './FileActionIcons'

export function FilePreview(): React.JSX.Element | null {
  const previewFile = useSessionStore((s) => s.previewFile)
  const previewCwd = useSessionStore((s) => s.previewCwd)
  const previewSource = useSessionStore((s) => s.previewSource)
  const previewLocationId = useSessionStore((s) => s.previewLocationId)
  const setPreviewFile = useSessionStore((s) => s.setPreviewFile)
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const addFileTab = useSessionStore((s) => s.addFileTab)
  const fileTreeOpen = useSessionStore((s) => s.fileTreeOpen)
  const fileTreeWidth = useSessionStore((s) => s.fileTreeWidth)

  const focusedSession = sessions.find((s) => s.id === focusedSessionId)
  const cwd = previewCwd ?? focusedSession?.cwd ?? null

  const panelRef = useRef<HTMLDivElement>(null)

  const editor = useFileEditor({ cwd, filePath: previewFile, locationId: previewLocationId })
  const { fileData, filename, content, isDirty, canEdit, saving, saveError, loadError, save } =
    editor

  const canOpenExternally = canOpenExternallyExt(filename)

  const close = useCallback(() => {
    setPreviewFile(null)
  }, [setPreviewFile])

  const handleClose = useCallback(() => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return
    close()
  }, [isDirty, close])

  const openInTab = useCallback(() => {
    if (!previewFile || !cwd) return
    const name = previewFile.split('/').pop() ?? previewFile
    addFileTab({
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      filePath: `${cwd}/${previewFile}`,
      name
    })
    close()
  }, [previewFile, cwd, addFileTab, close])

  const openExternally = useCallback(() => {
    if (!previewFile || !cwd) return
    window.electronAPI?.openPath(`${cwd}/${previewFile}`)
  }, [previewFile, cwd])

  // Keyboard: Escape closes; Cmd+S saves (skipped if the editor already handled it)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }
      if (e.key === 's' && e.metaKey) {
        if (e.defaultPrevented) return
        e.preventDefault()
        if (canEdit && isDirty) save()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose, canEdit, isDirty, save])

  // Click-outside closes — but never while there are unsaved edits
  useEffect(() => {
    if (!previewFile) return
    const handleMouseDown = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (isDirty) return
        close()
      }
    }
    window.addEventListener('mousedown', handleMouseDown)
    return () => window.removeEventListener('mousedown', handleMouseDown)
  }, [previewFile, isDirty, close])

  if (!previewFile) return null

  // Position: floating overlay to the left of the tree panel
  const rightOffset = previewSource === 'tree' && fileTreeOpen ? fileTreeWidth + 8 : 16
  const panelWidth = 560

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0, width: panelWidth }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
      className="fixed z-50 bg-surface-50 border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
      style={
        {
          right: rightOffset,
          top: '10%',
          maxHeight: '75vh',
          width: panelWidth,
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle flex-shrink-0">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
              {filename}
              {isDirty && (
                <span
                  className="inline-block w-2 h-2 rounded-full bg-accent flex-shrink-0"
                  title="Unsaved changes"
                />
              )}
            </div>
            {previewFile !== filename && (
              <div className="text-xs text-text-tertiary truncate">{previewFile}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {canEdit && (
            <button
              onClick={save}
              disabled={saving || !isDirty}
              className="px-2.5 py-1 rounded text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          <button onClick={openInTab} className={fileActionButtonClass} title="Open in tab">
            <WindowIcon className="w-3.5 h-3.5" />
          </button>
          {canOpenExternally && (
            <button
              onClick={openExternally}
              className={fileActionButtonClass}
              title="Open externally"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => navigator.clipboard.writeText(`./${previewFile}`)}
            className={fileActionButtonClass}
            title="Copy path"
          >
            <DocumentDuplicateIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleClose} className={fileActionButtonClass} title="Close">
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        <FileContent editor={editor} cwd={cwd} filePath={previewFile} />

        {saveError && (
          <div className="px-4 py-1.5 text-xs text-red-400 bg-red-500/5 border-t border-border-subtle flex-shrink-0">
            {saveError}
          </div>
        )}

        {fileData?.truncated && (
          <div className="px-4 py-1.5 text-xs text-yellow-500 bg-yellow-500/5 border-t border-border-subtle flex-shrink-0">
            File truncated at 1MB ({formatSize(fileData.size)} total)
          </div>
        )}
      </div>

      {/* Footer — file info */}
      {fileData && !loadError && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-subtle text-[10px] text-text-tertiary flex-shrink-0">
          <span>{formatSize(fileData.size)}</span>
          {!fileData.binary && <span>{countLines(content)} lines</span>}
        </div>
      )}
    </motion.div>
  )
}
