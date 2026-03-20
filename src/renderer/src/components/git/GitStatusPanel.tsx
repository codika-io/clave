import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useGitStatus } from '../../hooks/use-git-status'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { buildGitTree, compactTree, collectAllDirPaths } from '../../lib/git-file-tree'
import { GitLogView } from './GitLogView'
import { FileRow, GitTreeSection } from './GitFileRows'
import { SectionHeader, BranchHeader, ErrorBanner, PanelModeToggle, ViewModeToggle, CollapseAllButton } from './GitPanelControls'
import { CommitBar } from './GitCommitBar'
import type { GitFileStatus, GitStatusResult } from '../../../../preload/index.d'

// ---------------------------------------------------------------------------
// Per-cwd expanded directory cache — survives RepoSection unmount/remount
// ---------------------------------------------------------------------------

interface ExpandedCache {
  staged: Set<string>
  unstaged: Set<string>
  untracked: Set<string>
}

const expandedCacheMap = new Map<string, ExpandedCache>()

function getExpandedCache(cwd: string): ExpandedCache {
  let cache = expandedCacheMap.get(cwd)
  if (!cache) {
    cache = { staged: new Set(), unstaged: new Set(), untracked: new Set() }
    expandedCacheMap.set(cwd, cache)
  }
  return cache
}

// ---------------------------------------------------------------------------
// RepoSection — reusable file list + commit bar + diff view for a single repo
// ---------------------------------------------------------------------------

function RepoSection({
  cwd,
  status,
  filterPrefix,
  refresh,
  fillHeight = true
}: {
  cwd: string
  status: GitStatusResult
  filterPrefix?: string | null
  refresh: () => void
  fillHeight?: boolean
}) {
  const gitViewMode = useSessionStore((s) => s.gitViewMode)
  const setDiffPreview = useSessionStore((s) => s.setDiffPreview)
  const collapseAllTrigger = useSessionStore((s) => s.collapseAllTrigger)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Restore expanded state from per-cwd cache
  const cache = getExpandedCache(cwd)
  const [stagedExpanded, _setStagedExpanded] = useState<Set<string>>(() => cache.staged)
  const [unstagedExpanded, _setUnstagedExpanded] = useState<Set<string>>(() => cache.unstaged)
  const [untrackedExpanded, _setUntrackedExpanded] = useState<Set<string>>(() => cache.untracked)

  // Wrap setters to also persist to cache
  const setStagedExpanded: typeof _setStagedExpanded = useCallback((action) => {
    _setStagedExpanded((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      getExpandedCache(cwd).staged = next
      return next
    })
  }, [cwd])

  const setUnstagedExpanded: typeof _setUnstagedExpanded = useCallback((action) => {
    _setUnstagedExpanded((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      getExpandedCache(cwd).unstaged = next
      return next
    })
  }, [cwd])

  const setUntrackedExpanded: typeof _setUntrackedExpanded = useCallback((action) => {
    _setUntrackedExpanded((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      getExpandedCache(cwd).untracked = next
      return next
    })
  }, [cwd])

  const [confirmDiscard, setConfirmDiscard] = useState<{
    files: Array<{ path: string; status: string; staged: boolean }>
    label: string
  } | null>(null)
  const prevViewMode = useRef(gitViewMode)
  const prevCwdRef = useRef(cwd)

  // Sync expanded state from cache when cwd changes while mounted
  useEffect(() => {
    if (prevCwdRef.current !== cwd) {
      prevCwdRef.current = cwd
      const c = getExpandedCache(cwd)
      _setStagedExpanded(c.staged)
      _setUnstagedExpanded(c.unstaged)
      _setUntrackedExpanded(c.untracked)
    }
  }, [cwd])

  const openDiffPreview = useCallback(
    (file: GitFileStatus) => {
      setDiffPreview({
        file: file.path,
        cwd,
        type: 'working',
        staged: file.staged,
        fileStatus: file.status,
        hash: null
      })
    },
    [cwd, setDiffPreview]
  )

  const handleSelect = useCallback(
    (path: string, metaKey: boolean) => {
      if (metaKey) {
        setSelectedPaths((prev) => {
          const next = new Set(prev)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      } else {
        setSelectedPaths(new Set())
      }
    },
    []
  )

  const repoRoot = status?.repoRoot ?? cwd

  // Collapse all when trigger fires
  useEffect(() => {
    if (collapseAllTrigger > 0) {
      setStagedExpanded(new Set())
      setUnstagedExpanded(new Set())
      setUntrackedExpanded(new Set())
    }
  }, [collapseAllTrigger])

  // Auto-expand all dirs when switching to tree mode
  useEffect(() => {
    if (gitViewMode === 'tree' && prevViewMode.current === 'list' && status?.files) {
      const allFiles = status.files
      const tree = compactTree(buildGitTree(allFiles))
      const allPaths = collectAllDirPaths(tree)
      setStagedExpanded(allPaths)
      setUnstagedExpanded(allPaths)
      setUntrackedExpanded(allPaths)
    }
    prevViewMode.current = gitViewMode
  }, [gitViewMode, status?.files])

  const makeToggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (path: string) => {
      setter((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return next
      })
    },
    []
  )

  const toggleStagedExpanded = useCallback(makeToggle(setStagedExpanded), [makeToggle])
  const toggleUnstagedExpanded = useCallback(makeToggle(setUnstagedExpanded), [makeToggle])
  const toggleUntrackedExpanded = useCallback(makeToggle(setUntrackedExpanded), [makeToggle])

  // Compute relative filter prefix from the repo root
  const relativeFilterPrefix = useMemo(() => {
    if (!filterPrefix || !status?.repoRoot) return null
    const repoRoot = status.repoRoot
    if (!filterPrefix.startsWith(repoRoot + '/')) return null
    return filterPrefix.slice(repoRoot.length + 1) + '/'
  }, [filterPrefix, status?.repoRoot])

  const { staged, unstaged, untracked } = useMemo(() => {
    if (!status?.files) return { staged: [], unstaged: [], untracked: [] }
    const staged: GitFileStatus[] = []
    const unstaged: GitFileStatus[] = []
    const untracked: GitFileStatus[] = []
    for (const f of status.files) {
      if (relativeFilterPrefix && !f.path.startsWith(relativeFilterPrefix)) continue
      if (f.status === 'untracked') {
        untracked.push(f)
      } else if (f.staged) {
        staged.push(f)
      } else {
        unstaged.push(f)
      }
    }
    return { staged, unstaged, untracked }
  }, [status?.files, relativeFilterPrefix])

  const runOperation = useCallback(
    async (fn: () => Promise<void>) => {
      setError(null)
      setOperating(true)
      try {
        await fn()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setOperating(false)
        refresh()
      }
    },
    [refresh]
  )

  const stageFile = useCallback(
    (path: string) => {
      runOperation(() => window.electronAPI.gitStage(cwd, [path]))
    },
    [cwd, runOperation]
  )

  const unstageFile = useCallback(
    (path: string) => {
      runOperation(() => window.electronAPI.gitUnstage(cwd, [path]))
    },
    [cwd, runOperation]
  )

  const stageAll = useCallback(
    (files: GitFileStatus[]) => {
      runOperation(() =>
        window.electronAPI.gitStage(
          cwd,
          files.map((f) => f.path)
        )
      )
    },
    [cwd, runOperation]
  )

  const unstageAll = useCallback(() => {
    runOperation(() =>
      window.electronAPI.gitUnstage(
        cwd,
        staged.map((f) => f.path)
      )
    )
  }, [cwd, staged, runOperation])

  const promptDiscardFile = useCallback((file: GitFileStatus) => {
    const name = file.path.includes('/') ? file.path.split('/').pop()! : file.path
    setConfirmDiscard({
      files: [{ path: file.path, status: file.status, staged: file.staged }],
      label: `Discard changes to ${name}? This cannot be undone.`
    })
  }, [])

  const promptDiscardAll = useCallback((files: GitFileStatus[]) => {
    setConfirmDiscard({
      files: files.map((f) => ({ path: f.path, status: f.status, staged: f.staged })),
      label: `Discard all changes in ${files.length} file${files.length === 1 ? '' : 's'}? This cannot be undone.`
    })
  }, [])

  const executeDiscard = useCallback(() => {
    if (!confirmDiscard) return
    const filesToDiscard = confirmDiscard.files
    setConfirmDiscard(null)
    runOperation(() => window.electronAPI.gitDiscard(cwd, filesToDiscard))
  }, [cwd, confirmDiscard, runOperation])

  const totalFiltered = staged.length + unstaged.length + untracked.length

  // Clean state
  if (status.files.length === 0 || (relativeFilterPrefix && totalFiltered === 0)) {
    return (
      <>
        {error && <ErrorBanner message={error} />}
        <div className={`${fillHeight ? 'flex-1' : ''} flex items-center justify-center px-3 py-4`}>
          <span className="text-xs text-text-tertiary text-center">
            {relativeFilterPrefix ? 'No changes in this folder' : 'Working tree clean'}
          </span>
        </div>
        {(status.ahead > 0 || status.behind > 0) && (
          <CommitBar
            cwd={cwd}
            stagedCount={0}
            totalFileCount={0}
            allFilePaths={[]}
            ahead={status.ahead}
            behind={status.behind}
            operating={operating}
            onOperation={runOperation}
          />
        )}
      </>
    )
  }

  // File list + commit bar
  return (
    <>
      {error && <ErrorBanner message={error} />}
      {relativeFilterPrefix && (
        <div className="px-3 py-1 text-[10px] text-text-tertiary border-b border-border-subtle flex-shrink-0">
          Filtered to: {relativeFilterPrefix}
        </div>
      )}
      <div className={`${fillHeight ? 'flex-1 overflow-y-auto' : ''}`}>
        {staged.length > 0 && (
          <>
            <SectionHeader
              label="Staged"
              count={staged.length}
              action="Unstage All"
              onAction={unstageAll}
              discardAction="Discard All"
              onDiscardAction={() => promptDiscardAll(staged)}
              disabled={operating}
            />
            {gitViewMode === 'tree' ? (
              <GitTreeSection
                files={staged}
                cwd={repoRoot}
                selectedPaths={selectedPaths}
                expandedPaths={stagedExpanded}
                onToggleExpanded={toggleStagedExpanded}
                onClickFile={openDiffPreview}
                onSelect={handleSelect}
                onStageToggle={(f) => unstageFile(f.path)}
                onDiscard={promptDiscardFile}
                disabled={operating}
              />
            ) : (
              staged.map((f) => (
                <FileRow
                  key={`s-${f.path}`}
                  file={f}
                  cwd={repoRoot}
                  isSelected={selectedPaths.has(f.path)}
                  onClickName={() => openDiffPreview(f)}
                  onSelect={handleSelect}
                  onStageToggle={() => unstageFile(f.path)}
                  onDiscard={() => promptDiscardFile(f)}
                  disabled={operating}
                  selectedPaths={selectedPaths}
                />
              ))
            )}
          </>
        )}
        {unstaged.length > 0 && (
          <>
            <SectionHeader
              label="Modified"
              count={unstaged.length}
              action="Stage All"
              onAction={() => stageAll(unstaged)}
              discardAction="Discard All"
              onDiscardAction={() => promptDiscardAll(unstaged)}
              disabled={operating}
            />
            {gitViewMode === 'tree' ? (
              <GitTreeSection
                files={unstaged}
                cwd={repoRoot}
                selectedPaths={selectedPaths}
                expandedPaths={unstagedExpanded}
                onToggleExpanded={toggleUnstagedExpanded}
                onClickFile={openDiffPreview}
                onSelect={handleSelect}
                onStageToggle={(f) => stageFile(f.path)}
                onDiscard={promptDiscardFile}
                disabled={operating}
              />
            ) : (
              unstaged.map((f) => (
                <FileRow
                  key={`u-${f.path}`}
                  file={f}
                  cwd={repoRoot}
                  isSelected={selectedPaths.has(f.path)}
                  onClickName={() => openDiffPreview(f)}
                  onSelect={handleSelect}
                  onStageToggle={() => stageFile(f.path)}
                  onDiscard={() => promptDiscardFile(f)}
                  disabled={operating}
                  selectedPaths={selectedPaths}
                />
              ))
            )}
          </>
        )}
        {untracked.length > 0 && (
          <>
            <SectionHeader
              label="Untracked"
              count={untracked.length}
              action="Stage All"
              onAction={() => stageAll(untracked)}
              discardAction="Discard All"
              onDiscardAction={() => promptDiscardAll(untracked)}
              disabled={operating}
            />
            {gitViewMode === 'tree' ? (
              <GitTreeSection
                files={untracked}
                cwd={repoRoot}
                selectedPaths={selectedPaths}
                expandedPaths={untrackedExpanded}
                onToggleExpanded={toggleUntrackedExpanded}
                onClickFile={openDiffPreview}
                onSelect={handleSelect}
                onStageToggle={(f) => stageFile(f.path)}
                onDiscard={promptDiscardFile}
                disabled={operating}
              />
            ) : (
              untracked.map((f) => (
                <FileRow
                  key={`t-${f.path}`}
                  file={f}
                  cwd={repoRoot}
                  isSelected={selectedPaths.has(f.path)}
                  onClickName={() => openDiffPreview(f)}
                  onSelect={handleSelect}
                  onStageToggle={() => stageFile(f.path)}
                  onDiscard={() => promptDiscardFile(f)}
                  disabled={operating}
                  selectedPaths={selectedPaths}
                />
              ))
            )}
          </>
        )}
      </div>
      <CommitBar
        cwd={cwd}
        stagedCount={staged.length}
        totalFileCount={staged.length + unstaged.length + untracked.length}
        allFilePaths={[...staged, ...unstaged, ...untracked].map((f) => f.path)}
        ahead={status.ahead}
        behind={status.behind}
        operating={operating}
        onOperation={runOperation}
      />
      <ConfirmDialog
        isOpen={confirmDiscard !== null}
        title="Discard changes"
        message={confirmDiscard?.label ?? ''}
        onConfirm={executeDiscard}
        onCancel={() => setConfirmDiscard(null)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// GitStatusPanel — single-repo view (existing behavior)
// ---------------------------------------------------------------------------

export function GitStatusPanel({ cwd, isActive, filterPrefix }: { cwd: string | null; isActive: boolean; filterPrefix?: string | null }) {
  const focusedSessionId = useSessionStore((s) => s.focusedSessionId)
  const gitPanelMode = useSessionStore((s) => s.gitPanelMode)
  const { status, loading, refresh } = useGitStatus(cwd, isActive)

  if (!focusedSessionId || !cwd) {
    return (
      <div className="flex-1 flex items-center justify-center px-3">
        <span className="text-xs text-text-tertiary text-center">
          Focus a session to view git status
        </span>
      </div>
    )
  }

  if (loading && !status) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-text-tertiary">Loading...</span>
      </div>
    )
  }

  if (status && !status.isRepo) {
    return (
      <div className="flex-1 flex items-center justify-center px-3">
        <span className="text-xs text-text-tertiary text-center">Not a git repository</span>
      </div>
    )
  }

  if (!status) return null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <BranchHeader branch={status.branch} ahead={status.ahead} behind={status.behind} />
      {gitPanelMode === 'log' ? (
        <GitLogView
          cwd={cwd}
          branch={status.branch}
          ahead={status.ahead}
          behind={status.behind}
        />
      ) : (
        <RepoSection cwd={cwd} status={status} filterPrefix={filterPrefix} refresh={refresh} fillHeight />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MultiRepoGitPanel — multi-repo collapsible view with minimize/dock
// ---------------------------------------------------------------------------

function MultiRepoSection({
  name,
  repoPath,
  status,
  refresh,
  isSelected,
  onSelect,
  selectedRepoPaths
}: {
  name: string
  repoPath: string
  status: GitStatusResult
  refresh: () => void
  isSelected?: boolean
  onSelect?: (path: string, metaKey: boolean) => void
  selectedRepoPaths?: Set<string>
}) {
  const gitPanelMode = useSessionStore((s) => s.gitPanelMode)
  const collapseAllTrigger = useSessionStore((s) => s.collapseAllTrigger)
  const changeCount = status.files.length
  const hasChanges = changeCount > 0
  const hasRemoteChanges = status.behind > 0
  const shouldExpand = hasChanges || hasRemoteChanges
  const [expanded, setExpanded] = useState(shouldExpand)
  const initializedRef = useRef(false)

  // Update default expanded state when changes appear/disappear, but only on first load
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      setExpanded(shouldExpand)
    }
  }, [shouldExpand])

  // Collapse all when trigger fires
  useEffect(() => {
    if (collapseAllTrigger > 0) {
      setExpanded(false)
    }
  }, [collapseAllTrigger])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (selectedRepoPaths && selectedRepoPaths.size > 1 && selectedRepoPaths.has(repoPath)) {
        const paths = Array.from(selectedRepoPaths).join('\n')
        e.dataTransfer.setData('text/plain', paths)
      } else {
        e.dataTransfer.setData('text/plain', repoPath)
      }
      e.dataTransfer.effectAllowed = 'copy'
    },
    [repoPath, selectedRepoPaths]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.metaKey && onSelect) {
        e.preventDefault()
        onSelect(repoPath, true)
        return
      }
      onSelect?.(repoPath, false)
      setExpanded((v) => !v)
    },
    [repoPath, onSelect]
  )

  return (
    <div className="border-b border-border-subtle">
      {/* Collapsible header */}
      <button
        className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
          isSelected ? 'bg-surface-200' : 'hover:bg-surface-100'
        }`}
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
      >
        {/* Chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`text-text-tertiary flex-shrink-0 transition-transform duration-150 ${
            expanded ? 'rotate-90' : ''
          }`}
        >
          <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Repo name */}
        <span className="text-text-primary font-medium truncate">{name}</span>

        {/* Branch badge */}
        <span className="text-text-tertiary truncate">{status.branch}</span>

        {/* Badges (right-aligned) */}
        <span className="ml-auto flex-shrink-0 flex items-center gap-1.5">
          {status.behind > 0 && (
            <span className="text-[10px] font-medium text-orange-400">
              {'\u2193'}{status.behind}
            </span>
          )}
          {status.ahead > 0 && (
            <span className="text-[10px] font-medium text-green-400">
              {'\u2191'}{status.ahead}
            </span>
          )}
          {changeCount > 0 && (
            <span className="text-[10px] font-medium bg-surface-200 text-text-secondary rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {changeCount}
            </span>
          )}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="flex flex-col">
          {gitPanelMode === 'log' ? (
            <GitLogView
              cwd={repoPath}
              branch={status.branch}
              ahead={status.ahead}
              behind={status.behind}
            />
          ) : (
            <RepoSection
              cwd={repoPath}
              status={status}
              refresh={refresh}
              fillHeight={false}
            />
          )}
        </div>
      )}
    </div>
  )
}

export function MultiRepoGitPanel({
  repos,
  rootPath,
  refresh
}: {
  repos: Array<{ name: string; path: string; status: GitStatusResult }>
  rootPath?: string | null
  refresh: () => void
}) {
  const [nestedDocked, setNestedDocked] = useState(false)
  const [selectedRepoPaths, setSelectedRepoPaths] = useState<Set<string>>(new Set())

  const handleRepoSelect = useCallback(
    (path: string, metaKey: boolean) => {
      if (metaKey) {
        setSelectedRepoPaths((prev) => {
          const next = new Set(prev)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      } else {
        setSelectedRepoPaths(new Set())
      }
    },
    []
  )

  const rootRepo = rootPath ? repos.find((r) => r.path === rootPath) ?? null : null
  const nestedRepos = rootPath ? repos.filter((r) => r.path !== rootPath) : repos
  const hasRoot = rootRepo !== null

  const nestedChangeCount = useMemo(
    () => nestedRepos.reduce((sum, r) => sum + r.status.files.length, 0),
    [nestedRepos]
  )

  const gitPanelMode = useSessionStore((s) => s.gitPanelMode)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-end gap-0.5 px-3 py-1 border-b border-border-subtle flex-shrink-0">
        <PanelModeToggle />
        {gitPanelMode === 'changes' && <ViewModeToggle />}
        <CollapseAllButton />
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* Root repo */}
        {rootRepo && (
          <MultiRepoSection
            name={rootRepo.name}
            repoPath={rootRepo.path}
            status={rootRepo.status}
            refresh={refresh}
            isSelected={selectedRepoPaths.has(rootRepo.path)}
            onSelect={handleRepoSelect}
            selectedRepoPaths={selectedRepoPaths}
          />
        )}

        {/* Separator with dock arrow — only when root + nested coexist and nested are visible */}
        {hasRoot && nestedRepos.length > 0 && !nestedDocked && (
          <div className="group/sep flex items-center gap-0 px-3 py-1">
            <div className="flex-1 h-px bg-border" />
            <button
              className="p-0.5 rounded text-text-tertiary opacity-0 group-hover/sep:opacity-100 hover:text-text-primary hover:bg-surface-200 transition-all flex-shrink-0 mx-1"
              onClick={() => setNestedDocked(true)}
              title="Dock nested repos"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2.5 4L5 7l2.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        {/* Nested repos (when root exists) — visible when not docked */}
        {hasRoot &&
          !nestedDocked &&
          nestedRepos.map((repo) => (
            <MultiRepoSection
              key={repo.path}
              name={repo.name}
              repoPath={repo.path}
              status={repo.status}
              refresh={refresh}
              isSelected={selectedRepoPaths.has(repo.path)}
              onSelect={handleRepoSelect}
              selectedRepoPaths={selectedRepoPaths}
            />
          ))}

        {/* All repos flat when CWD is not itself a repo (no root) */}
        {!hasRoot &&
          repos.map((repo) => (
            <MultiRepoSection
              key={repo.path}
              name={repo.name}
              repoPath={repo.path}
              status={repo.status}
              refresh={refresh}
              isSelected={selectedRepoPaths.has(repo.path)}
              onSelect={handleRepoSelect}
              selectedRepoPaths={selectedRepoPaths}
            />
          ))}
      </div>

      {/* Bottom dock tab for nested repos */}
      {nestedDocked && nestedRepos.length > 0 && (
        <div className="flex-shrink-0 border-t border-border px-2 py-1.5 bg-surface-100/50">
          <button
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded bg-surface-100 hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors w-full"
            onClick={() => setNestedDocked(false)}
            title="Restore nested repos"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="flex-shrink-0">
              <path d="M2 5.5L4 3l2 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{nestedRepos.length} nested repo{nestedRepos.length !== 1 ? 's' : ''}</span>
            {nestedChangeCount > 0 && (
              <span className="bg-surface-200 text-text-tertiary rounded-full px-1.5 min-w-[16px] text-center text-[9px]">
                {nestedChangeCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
