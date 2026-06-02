import { useState } from 'react'
import { CodeEditor } from './CodeEditor'
import { MarkdownRenderer } from './MarkdownRenderer'
import { formatSize, isMarkdownFile } from './file-types'
import type { useFileEditor } from '../../hooks/use-file-editor'

interface FileContentProps {
  editor: ReturnType<typeof useFileEditor>
  cwd: string | null
  filePath: string | null
}

/**
 * Shared body for the file preview panel and the file tab. Branches by file
 * kind and renders the always-live CodeEditor for code. Markdown opens rendered
 * with a Source/Preview toggle (source shows the same editable buffer).
 */
export function FileContent({ editor, cwd, filePath }: FileContentProps): React.JSX.Element {
  const { fileData, filename, content, setContent, canEdit, isImage, loadError, save } = editor
  const isMarkdown = filePath ? isMarkdownFile(filename) : false
  const [showSource, setShowSource] = useState(false)

  // Reset the markdown view to rendered whenever the file changes (derive, no effect)
  const [prevFilePath, setPrevFilePath] = useState(filePath)
  if (filePath !== prevFilePath) {
    setPrevFilePath(filePath)
    setShowSource(false)
  }

  if (loadError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-text-tertiary">Failed to load file</div>
    )
  }

  if (isImage && filePath) {
    const src = filePath.startsWith('/') ? `file://${filePath}` : `file://${cwd}/${filePath}`
    return (
      <div className="p-4 flex items-center justify-center">
        <img src={src} alt={filename} className="max-w-full max-h-[50vh] object-contain rounded" />
      </div>
    )
  }

  if (!fileData) {
    return <div className="px-4 py-8 text-center text-sm text-text-tertiary">Loading…</div>
  }

  if (fileData.binary) {
    return (
      <div className="px-4 py-8 text-center text-sm text-text-tertiary">
        Binary file &mdash; cannot preview
        <div className="mt-1 text-xs">{formatSize(fileData.size)}</div>
      </div>
    )
  }

  if (fileData.size > 1024 * 1024) {
    return (
      <div className="px-4 py-8 text-center text-sm text-text-tertiary">
        File too large to preview
        <div className="mt-1 text-xs">{formatSize(fileData.size)}</div>
      </div>
    )
  }

  const renderMarkdownToggle = isMarkdown && (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border-subtle flex-shrink-0">
      <button
        onClick={() => setShowSource(false)}
        className={`px-2 py-0.5 rounded text-xs transition-colors ${
          !showSource
            ? 'bg-surface-200 text-text-primary'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
      >
        Preview
      </button>
      <button
        onClick={() => setShowSource(true)}
        className={`px-2 py-0.5 rounded text-xs transition-colors ${
          showSource
            ? 'bg-surface-200 text-text-primary'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
      >
        Source
      </button>
    </div>
  )

  // Markdown, rendered
  if (isMarkdown && !showSource) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {renderMarkdownToggle}
        <div className="flex-1 overflow-auto min-h-0">
          <MarkdownRenderer content={content} />
        </div>
      </div>
    )
  }

  // Code (and markdown source) — always-live editor
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {renderMarkdownToggle}
      <CodeEditor
        value={content}
        onChange={setContent}
        filename={filename}
        readOnly={!canEdit}
        onSave={save}
        className="flex-1 min-h-0"
      />
    </div>
  )
}
