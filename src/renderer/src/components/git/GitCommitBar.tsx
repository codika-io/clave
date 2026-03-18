import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { useSessionStore } from '../../store/session-store'
import type { PullStrategy } from './git-status-utils'

export function PullButton({
  cwd,
  operating,
  onOperation
}: {
  cwd: string
  operating: boolean
  onOperation: (fn: () => Promise<void>) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handlePull = useCallback(
    (strategy: PullStrategy) => {
      setMenuOpen(false)
      onOperation(async () => {
        await window.electronAPI.gitPull(cwd, strategy)
      })
    },
    [cwd, onOperation]
  )

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-center">
        <button
          className="text-xs font-medium pl-2 pr-1 py-1 rounded-l bg-surface-100 text-text-secondary hover:text-text-primary disabled:opacity-40 transition-all"
          disabled={operating}
          onClick={() => handlePull('auto')}
          title="Pull (auto: fast-forward, then merge)"
        >
          {'\u2193'} Pull
        </button>
        <button
          className="text-xs py-1 pr-1.5 pl-0.5 rounded-r bg-surface-100 text-text-tertiary hover:text-text-primary disabled:opacity-40 transition-all border-l border-border-subtle"
          disabled={operating}
          onClick={() => setMenuOpen((v) => !v)}
          title="Pull options"
        >
          <ChevronDownIcon className="w-3 h-3" />
        </button>
      </div>
      {menuOpen && (
        <div className="absolute bottom-full right-0 mb-1 bg-surface-200 border border-border-subtle rounded shadow-lg py-0.5 z-50 min-w-[140px]">
          {([
            ['auto', 'Pull'],
            ['merge', 'Pull (Merge)'],
            ['rebase', 'Pull (Rebase)'],
            ['ff-only', 'Pull (FF only)']
          ] as [PullStrategy, string][]).map(([strategy, label]) => (
            <button
              key={strategy}
              className="w-full text-left text-xs px-3 py-1.5 text-text-secondary hover:bg-surface-100 hover:text-text-primary transition-colors"
              onClick={() => handlePull(strategy)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CommitBar({
  cwd,
  stagedCount,
  totalFileCount,
  allFilePaths,
  ahead,
  behind,
  operating,
  onOperation
}: {
  cwd: string
  stagedCount: number
  totalFileCount: number
  allFilePaths: string[]
  ahead: number
  behind: number
  operating: boolean
  onOperation: (fn: () => Promise<void>) => void
}) {
  const commitMessage = useSessionStore((s) => s.commitMessages[cwd] ?? '')
  const generating = useSessionStore((s) => s.generatingCommitCwds.has(cwd))
  const setCommitMessage = useCallback(
    (msg: string) => useSessionStore.getState().setCommitMessage(cwd, msg),
    [cwd]
  )

  const handleGenerateMessage = useCallback(async () => {
    if (totalFileCount === 0 || generating) return
    const store = useSessionStore.getState()
    store.setGeneratingCommit(cwd, true)
    try {
      // Stage all files first
      if (allFilePaths.length > 0) {
        await window.electronAPI.gitStage(cwd, allFilePaths)
      }
      const message = await window.electronAPI.gitGenerateCommitMessage(cwd)
      // Write to store directly so it persists even if component unmounted
      useSessionStore.getState().setCommitMessage(cwd, message)
    } catch (err) {
      console.error('Failed to generate commit message:', err)
    } finally {
      useSessionStore.getState().setGeneratingCommit(cwd, false)
    }
  }, [cwd, totalFileCount, allFilePaths, generating])

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim() || stagedCount === 0) return
    const msg = commitMessage
    onOperation(async () => {
      await window.electronAPI.gitCommit(cwd, msg)
      useSessionStore.getState().setCommitMessage(cwd, '')
    })
  }, [cwd, commitMessage, stagedCount, onOperation])

  const handlePush = useCallback(() => {
    onOperation(async () => {
      await window.electronAPI.gitPush(cwd)
    })
  }, [cwd, onOperation])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        handleCommit()
      }
    },
    [handleCommit]
  )

  return (
    <div className="border-t border-border-subtle p-2 flex-shrink-0 flex flex-col gap-1.5">
      <div className="relative">
        <textarea
          className="w-full bg-surface-100 text-text-primary text-xs rounded px-2 py-1.5 pr-7 resize-none outline-none border border-transparent focus:border-accent placeholder:text-text-tertiary"
          rows={2}
          placeholder="Commit message..."
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value as string)}
          onKeyDown={handleKeyDown}
          disabled={operating || generating}
        />
        <button
          className="absolute right-1.5 top-1.5 p-0.5 rounded text-text-tertiary hover:text-accent disabled:opacity-30 transition-colors"
          disabled={totalFileCount === 0 || generating || operating}
          onClick={handleGenerateMessage}
          title="Generate commit message with AI"
        >
          {generating ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
            </svg>
          )}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          className="flex-1 text-xs font-medium px-2 py-1 rounded bg-accent text-white disabled:opacity-40 transition-opacity"
          disabled={operating || stagedCount === 0 || !commitMessage.trim()}
          onClick={handleCommit}
        >
          Commit
        </button>
        {ahead > 0 && (
          <button
            className="text-xs font-medium px-2 py-1 rounded bg-surface-100 text-text-secondary hover:text-text-primary disabled:opacity-40 transition-all"
            disabled={operating}
            onClick={handlePush}
            title="Push"
          >
            {'\u2191'} Push
          </button>
        )}
        {behind > 0 && (
          <PullButton cwd={cwd} operating={operating} onOperation={onOperation} />
        )}
      </div>
    </div>
  )
}
