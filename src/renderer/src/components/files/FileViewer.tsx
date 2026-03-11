import { useCallback } from 'react'
import { useSessionStore, type FileTab } from '../../store/session-store'
import { FileContentRenderer } from './FileContentRenderer'
import { DocumentTextIcon } from '@heroicons/react/24/outline'

interface FileViewerProps {
  fileTab: FileTab
}

export function FileViewer({ fileTab }: FileViewerProps) {
  const removeFileTab = useSessionStore((s) => s.removeFileTab)

  const filename = fileTab.filePath.split('/').pop() ?? ''
  // Extract cwd: everything up to the last path component
  const cwd = fileTab.filePath.substring(0, fileTab.filePath.lastIndexOf('/')) || '/'
  // Relative path for readFile: just the filename
  const relativePath = filename

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(fileTab.filePath)
  }, [fileTab.filePath])

  const handleRevealInFinder = useCallback(() => {
    window.electronAPI?.showItemInFolder(fileTab.filePath)
  }, [fileTab.filePath])

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <DocumentTextIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          <span className="text-sm font-medium text-text-primary truncate">{fileTab.name}</span>
          {fileTab.name !== filename && (
            <span className="text-xs text-text-tertiary truncate hidden sm:inline">{filename}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={handleCopyPath}
            className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors"
            title="Copy path"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8.5 3.5V2C8.5 1.45 8.05 1 7.5 1H2C1.45 1 1 1.45 1 2V7.5C1 8.05 1.45 8.5 2 8.5H3.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            onClick={handleRevealInFinder}
            className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors"
            title="Reveal in Finder"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 3C1 2.45 1.45 2 2 2H4.5L6 3.5H10C10.55 3.5 11 3.95 11 4.5V9C11 9.55 10.55 10 10 10H2C1.45 10 1 9.55 1 9V3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => removeFileTab(fileTab.id)}
            className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors"
            title="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Full path breadcrumb */}
      <div className="px-4 py-1 border-b border-border-subtle flex-shrink-0">
        <span className="text-[10px] text-text-tertiary truncate block">
          {fileTab.filePath.replace(/^\/Users\/[^/]+/, '~')}
        </span>
      </div>

      {/* File content */}
      <FileContentRenderer
        filePath={relativePath}
        cwd={cwd}
        className="flex-1"
      />
    </div>
  )
}
