import { FileContent } from './FileContent'
import { useFileEditor } from '../../hooks/use-file-editor'
import { formatSize, countLines } from './file-types'

interface FileContentRendererProps {
  editor: ReturnType<typeof useFileEditor>
  filePath: string | null
  cwd: string | null
  className?: string
}

export function FileContentRenderer({
  editor,
  filePath,
  cwd,
  className
}: FileContentRendererProps): React.JSX.Element | null {
  const { fileData, content, saveError, loadError } = editor

  if (!filePath) return null

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ''}`}>
      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        <FileContent editor={editor} cwd={cwd} filePath={filePath} />

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

      {/* Footer */}
      {fileData && !loadError && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-subtle text-[10px] text-text-tertiary flex-shrink-0">
          <span>{formatSize(fileData.size)}</span>
          {!fileData.binary && <span>{countLines(content)} lines</span>}
        </div>
      )}
    </div>
  )
}
