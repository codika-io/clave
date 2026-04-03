import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FolderIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface RemoteDirectoryPickerProps {
  locationId: string
  locationName: string
  onSelect: (path: string) => void
  onCancel: () => void
}

interface DirEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

export function RemoteDirectoryPicker({
  locationId,
  locationName,
  onSelect,
  onCancel
}: RemoteDirectoryPickerProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pathInput, setPathInput] = useState('')

  // Resolve home directory on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await window.electronAPI.sshExec(locationId, 'echo $HOME')
        const home = result.stdout.trim()
        if (!cancelled) {
          setCurrentPath(home)
          setPathInput(home)
        }
      } catch {
        if (!cancelled) {
          setCurrentPath('/home')
          setPathInput('/home')
        }
      }
    })()
    return () => { cancelled = true }
  }, [locationId])

  // Load directory contents when path changes
  useEffect(() => {
    if (!currentPath) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const items = await window.electronAPI.sftpReadDir(locationId, currentPath)
        if (!cancelled) {
          setEntries(
            (items as DirEntry[])
              .filter((e) => e.type === 'directory')
              .sort((a, b) => a.name.localeCompare(b.name))
          )
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to read directory')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [locationId, currentPath])

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path)
    setPathInput(path)
  }, [])

  const handlePathSubmit = useCallback(() => {
    const trimmed = pathInput.trim()
    if (trimmed) {
      setCurrentPath(trimmed)
    }
  }, [pathInput])

  const goUp = useCallback(() => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
    navigateTo(parent)
  }, [currentPath, navigateTo])

  // Breadcrumb segments
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean)
    return parts.map((part, i) => ({
      name: part,
      path: '/' + parts.slice(0, i + 1).join('/')
    }))
  }, [currentPath])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] max-h-[500px] flex flex-col bg-surface-100 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary">
            Choose directory on {locationName}
          </h3>
        </div>

        {/* Path input */}
        <div className="px-4 py-2 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePathSubmit()
              }}
              className="flex-1 h-7 px-2 rounded-lg bg-surface-0 border border-border-subtle text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent transition-colors font-mono"
              placeholder="/path/to/directory"
            />
            <button
              onClick={handlePathSubmit}
              className="h-7 px-2 rounded-lg text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-200 transition-colors"
            >
              Go
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="px-4 py-1.5 flex items-center gap-0.5 text-xs text-text-tertiary overflow-x-auto flex-shrink-0">
          <button
            onClick={() => navigateTo('/')}
            className="hover:text-text-primary transition-colors flex-shrink-0"
          >
            /
          </button>
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-0.5 flex-shrink-0">
              <ChevronRightIcon className="w-3 h-3" />
              <button
                onClick={() => navigateTo(crumb.path)}
                className={`hover:text-text-primary transition-colors ${i === breadcrumbs.length - 1 ? 'text-text-primary font-medium' : ''}`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-text-tertiary">Loading...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-red-400">{error}</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-text-tertiary">No subdirectories</span>
            </div>
          ) : (
            <>
              {currentPath !== '/' && (
                <button
                  onClick={goUp}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-200 transition-colors text-left"
                >
                  <FolderIcon className="w-4 h-4 text-text-tertiary" />
                  <span className="text-xs text-text-secondary">..</span>
                </button>
              )}
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => navigateTo(entry.path)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-200 transition-colors text-left"
                >
                  <FolderIcon className="w-4 h-4 text-text-tertiary" />
                  <span className="text-xs text-text-primary">{entry.name}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-subtle flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary font-mono truncate max-w-[280px]">
            {currentPath}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="h-7 px-3 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(currentPath)}
              disabled={!currentPath}
              className="h-7 px-4 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
