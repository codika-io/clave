import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useSessionStore } from '../../store/session-store'
import { FileTree } from '../files/FileTree'
import { GitStatusPanel } from './GitStatusPanel'
import { shortenPath } from '../../lib/utils'

function getParentPaths(fullPath: string): { path: string; name: string }[] {
  const homedir = fullPath.match(/^\/Users\/[^/]+/)?.[0] ?? ''
  const parts = fullPath.split('/').filter(Boolean)
  const result: { path: string; name: string }[] = []
  for (let i = parts.length; i >= 1; i--) {
    const p = '/' + parts.slice(0, i).join('/')
    const name = p === homedir ? '~' : parts[i - 1]
    result.push({ path: p, name })
  }
  result.push({ path: '/', name: '/' })
  return result
}

export function SidePanel() {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const toggleFileTree = useSessionStore((s) => s.toggleFileTree)
  const sidePanelTab = useSessionStore((s) => s.sidePanelTab)
  const setSidePanelTab = useSessionStore((s) => s.setSidePanelTab)

  const focusedSession = sessions.find((s) => s.id === focusedSessionId)
  const sessionCwd = focusedSession?.cwd ?? null

  const [customCwd, setCustomCwd] = useState<string | null>(null)
  const prevSessionIdRef = useRef(focusedSessionId)
  const [pathMenuOpen, setPathMenuOpen] = useState(false)
  const pathButtonRef = useRef<HTMLButtonElement>(null)
  const pathMenuRef = useRef<HTMLDivElement>(null)

  // Reset custom cwd when focused session changes
  useEffect(() => {
    if (focusedSessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = focusedSessionId
      setCustomCwd(null)
    }
  }, [focusedSessionId])

  const cwd = customCwd ?? sessionCwd
  const isCustom = customCwd !== null

  const displayPath = useMemo(() => {
    if (!cwd) return ''
    return shortenPath(cwd)
  }, [cwd])

  const handleChangeFolder = useCallback(async () => {
    const folderPath = await window.electronAPI?.openFolderDialog()
    if (folderPath) {
      setCustomCwd(folderPath)
    }
  }, [])

  const handleResetFolder = useCallback(() => {
    setCustomCwd(null)
  }, [])

  const parentPaths = useMemo(() => {
    if (!cwd) return []
    return getParentPaths(cwd)
  }, [cwd])

  // Close path menu on outside click or Escape
  useEffect(() => {
    if (!pathMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        pathMenuRef.current &&
        !pathMenuRef.current.contains(e.target as Node) &&
        pathButtonRef.current &&
        !pathButtonRef.current.contains(e.target as Node)
      ) {
        setPathMenuOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPathMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [pathMenuOpen])

  return (
    <div className="flex flex-col h-full bg-surface-50 border-l border-border">
      {/* Tabbed header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-subtle flex-shrink-0">
        {/* File tree tab */}
        <button
          onClick={() => setSidePanelTab('files')}
          className={`p-1 rounded hover:bg-surface-200 transition-colors flex-shrink-0 ${
            sidePanelTab === 'files' ? 'text-accent' : 'text-text-tertiary hover:text-text-primary'
          }`}
          title="File tree"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6.5 1H3a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h4.5a1 1 0 0 0 1-1V2.5L6.5 1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M4.5 9.5V10a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1V4.5a1 1 0 0 0-1-1h-.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* Git tab */}
        <button
          onClick={() => setSidePanelTab('git')}
          className={`p-1 rounded hover:bg-surface-200 transition-colors flex-shrink-0 ${
            sidePanelTab === 'git' ? 'text-accent' : 'text-text-tertiary hover:text-text-primary'
          }`}
          title="Git status"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="1.5" r="1.25" stroke="currentColor" strokeWidth="1.1" />
            <circle cx="3" cy="10.5" r="1.25" stroke="currentColor" strokeWidth="1.1" />
            <circle cx="9" cy="10.5" r="1.25" stroke="currentColor" strokeWidth="1.1" />
            <path d="M6 2.75v3.5" stroke="currentColor" strokeWidth="1.1" />
            <path d="M6 6.25L3 9.25" stroke="currentColor" strokeWidth="1.1" />
            <path d="M6 6.25l3 3" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>

        {/* Path display — clickable with parent folder dropdown */}
        <div className="relative flex-1 min-w-0">
          <button
            ref={pathButtonRef}
            onClick={() => cwd && setPathMenuOpen((v) => !v)}
            className="w-full text-left text-xs text-text-secondary font-medium truncate hover:text-text-primary cursor-pointer transition-colors"
            title={cwd ?? ''}
          >
            {displayPath}
          </button>
          {pathMenuOpen && parentPaths.length > 0 && (
            <div
              ref={pathMenuRef}
              className="fixed z-50 min-w-[180px] max-w-[320px] max-h-[60vh] overflow-y-auto py-1 bg-surface-100 border border-border rounded-lg shadow-xl"
              style={{
                top: (pathButtonRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                right:
                  document.documentElement.clientWidth -
                  (pathButtonRef.current?.getBoundingClientRect().right ?? 0)
              }}
            >
              {parentPaths.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    setCustomCwd(item.path)
                    setPathMenuOpen(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium hover:bg-surface-200 transition-colors ${
                    item.path === cwd ? 'text-accent' : 'text-text-primary'
                  }`}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="flex-shrink-0"
                  >
                    <path
                      d="M1.5 2.5a1 1 0 0 1 1-1h2.172a1 1 0 0 1 .707.293L6.5 2.914a1 1 0 0 0 .707.293H9.5a1 1 0 0 1 1 1v5.293a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V2.5Z"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Close */}
        <button
          onClick={toggleFileTree}
          className="p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
          title="Close panel"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Active tab content */}
      {sidePanelTab === 'files' ? (
        <FileTree
          cwd={cwd}
          isCustom={isCustom}
          onChangeFolder={handleChangeFolder}
          onResetFolder={handleResetFolder}
        />
      ) : (
        <GitStatusPanel cwd={cwd} isActive={sidePanelTab === 'git'} />
      )}
    </div>
  )
}
