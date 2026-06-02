import { FileContent } from './FileContent'
import { useFileEditor } from '../../hooks/use-file-editor'
import { formatSize, countLines } from './file-types'

interface FileContentRendererProps {
  filePath: string | null
  cwd: string | null
  className?: string
}

export function FileContentRenderer({
  filePath,
  cwd,
  className
}: FileContentRendererProps): React.JSX.Element | null {
  const editor = useFileEditor({ cwd, filePath })
  const { fileData, content, isDirty, canEdit, saving, saveError, loadError, save } = editor

  if (!filePath) return null

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ''}`}>
      {/* Edit toolbar */}
      {canEdit && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            {isDirty && (
              <>
                <span
                  className="inline-block w-2 h-2 rounded-full bg-accent flex-shrink-0"
                  title="Unsaved changes"
                />
                <span>Unsaved changes</span>
              </>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving || !isDirty}
            className="px-2.5 py-1 rounded text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

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
