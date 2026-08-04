import { useState } from 'react'
import { isMarkdownFile, type FileViewMode } from '../components/files/file-types'

interface UseFileViewMode {
  isMarkdown: boolean
  viewMode: FileViewMode
  setViewMode: (mode: FileViewMode) => void
}

/**
 * View-mode state for a file surface (file tab or preview panel). Markdown
 * opens as a page by default; resets whenever the underlying file changes.
 */
export function useFileViewMode(filePath: string | null): UseFileViewMode {
  const [viewMode, setViewMode] = useState<FileViewMode>('page')

  // Reset to page whenever the file changes (derive, no effect)
  const [prevFilePath, setPrevFilePath] = useState(filePath)
  if (filePath !== prevFilePath) {
    setPrevFilePath(filePath)
    setViewMode('page')
  }

  const filename = filePath?.split('/').pop() ?? ''
  return { isMarkdown: !!filePath && isMarkdownFile(filename), viewMode, setViewMode }
}
