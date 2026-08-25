import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useAgentStore } from '../../store/agent-store'
import { useLocationStore } from '../../store/location-store'
import { FileTree } from '../files/FileTree'
import { RemoteFileTree } from '../files/RemoteFileTree'
import { GitStatusPanel, MultiRepoGitPanel } from './GitStatusPanel'
import { MagicPullButton, MagicSyncButton, ViewModeToggle, PanelModeToggle, CollapseAllButton, CommitBarToggle, JourneyButton, GitSyncBadge } from './GitPanelControls'
import { useMultiRepoStatus } from '../../hooks/use-multi-repo-status'
import { useGitStatus } from '../../hooks/use-git-status'
import { shortenPath } from '../../lib/utils'
import { HelpPanel } from '../help/HelpPanel'
import { Tooltip, TooltipTrigger, TooltipContent, IconButton } from '../ui/tooltip'
import {
  InformationCircleIcon,
  ChevronLeftIcon,
  FolderOpenIcon,
  ArrowUturnLeftIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'

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
  const sidePanelTab = useSessionStore((s) => s.sidePanelTab)
  const setSidePanelTab = useSessionStore((s) => s.setSidePanelTab)


  const focusedSession = sessions.find((s) => s.id === focusedSessionId)
  const sessionCwd = focusedSession?.cwd ?? null

  // Determine if focused session is remote
  const isRemoteSession = focusedSession?.sessionType === 'remote-terminal' ||
    focusedSession?.sessionType === 'remote-claude' ||
    focusedSession?.sessionType === 'agent'
  const remoteLocationId = isRemoteSession ? focusedSession?.locationId : undefined

  // For agent sessions, resolve cwd from agent store if session cwd is empty
  const agentCwd = useMemo(() => {
    if (focusedSession?.sessionType !== 'agent' || !focusedSession.agentId) return null
    const agent = useAgentStore.getState().agents.find((a) => a.id === focusedSession.agentId)
    return agent?.cwd ?? null
  }, [focusedSession?.sessionType, focusedSession?.agentId])

  const effectiveCwd = isRemoteSession ? (sessionCwd || agentCwd || '~') : sessionCwd

  // Resolve location name for remote sessions
  const locationName = useMemo(() => {
    if (!remoteLocationId) return null
    return useLocationStore.getState().locations.find((l) => l.id === remoteLocationId)?.name ?? null
  }, [remoteLocationId])

  const [customCwd, _setCustomCwd] = useState<string | null>(null)
  const navMapRef = useRef(new Map<string, string>())        // sessionId -> current customCwd
  const navStackRef = useRef(new Map<string, string[]>())    // sessionId -> back stack
  const prevSessionIdRef = useRef(focusedSessionId)
  const [canGoBack, setCanGoBack] = useState(false)
  const [pathMenuOpen, setPathMenuOpen] = useState(false)
  const pathButtonRef = useRef<HTMLButtonElement>(null)
  const pathMenuRef = useRef<HTMLDivElement>(null)

  const updateCanGoBack = useCallback(() => {
    if (!focusedSessionId) { setCanGoBack(false); return }
    const stack = navStackRef.current.get(focusedSessionId)
    setCanGoBack(!!stack && stack.length > 0)
  }, [focusedSessionId])

  // Navigate forward — pushes current cwd onto the back stack
  const setCustomCwd = useCallback(
    (path: string | null) => {
      if (focusedSessionId) {
        if (path) {
          // Push current location onto the back stack before navigating
          const currentCwd = customCwd ?? sessionCwd
          if (currentCwd && currentCwd !== path) {
            const stack = navStackRef.current.get(focusedSessionId) ?? []
            stack.push(currentCwd)
            navStackRef.current.set(focusedSessionId, stack)
          }
          navMapRef.current.set(focusedSessionId, path)
        } else {
          // Reset to root — clear everything
          navStackRef.current.delete(focusedSessionId)
          navMapRef.current.delete(focusedSessionId)
        }
      }
      _setCustomCwd(path)
      updateCanGoBack()
    },
    [focusedSessionId, customCwd, sessionCwd, updateCanGoBack]
  )

  // Navigate back — pops from the stack
  const goBack = useCallback(() => {
    if (!focusedSessionId) return
    const stack = navStackRef.current.get(focusedSessionId)
    if (!stack || stack.length === 0) return
    const prev = stack.pop()!
    if (stack.length === 0) navStackRef.current.delete(focusedSessionId)
    const newCwd = prev === sessionCwd ? null : prev
    _setCustomCwd(newCwd)
    if (newCwd) {
      navMapRef.current.set(focusedSessionId, newCwd)
    } else {
      navMapRef.current.delete(focusedSessionId)
    }
    updateCanGoBack()
  }, [focusedSessionId, sessionCwd, updateCanGoBack])

  // Restore from nav map when focused session changes
  useEffect(() => {
    if (focusedSessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = focusedSessionId
      const saved = focusedSessionId ? navMapRef.current.get(focusedSessionId) ?? null : null
      _setCustomCwd(saved)
      updateCanGoBack()
    }
  }, [focusedSessionId, updateCanGoBack])

  const cwd = customCwd ?? sessionCwd
  const isCustom = customCwd !== null

  // Force files tab for remote sessions
  const effectiveTab = isRemoteSession ? 'files' : sidePanelTab
  const isGitTabActive = effectiveTab === 'git'
  const multiRepo = useMultiRepoStatus(cwd, isGitTabActive)

  // Single-repo git status — used for branch badge in path row
  const isSingleRepo = isGitTabActive && multiRepo.result.mode === 'single'
  const singleRepoGit = useGitStatus(isSingleRepo ? cwd : null, isSingleRepo)

  // Single-repo sections, driven by the toolbar's ↓/↑/+ badge-buttons.
  // Per-repo state: a folder switch resets it (guarded adjust-during-render).
  const [showIncomingSingle, setShowIncomingSingle] = useState(false)
  const [showOutgoingSingle, setShowOutgoingSingle] = useState(false)
  // The local work is what the panel is for, so this one starts on.
  const [showChangesSingle, setShowChangesSingle] = useState(true)
  const [prevRangeCwd, setPrevRangeCwd] = useState(cwd)
  if (prevRangeCwd !== cwd) {
    setPrevRangeCwd(cwd)
    setShowIncomingSingle(false)
    setShowOutgoingSingle(false)
    setShowChangesSingle(true)
  }

  // The repo's dirt, driving the toolbar's + badge.
  const singleRepoChangeCount = singleRepoGit.status?.files.length ?? 0


  // Compute repo paths for MagicSync across all git modes
  const allRepoPaths = useMemo(() => {
    if (multiRepo.result.mode === 'multi') return multiRepo.result.repos.map((r) => r.path)
    if (isSingleRepo && cwd) return [cwd]
    return []
  }, [multiRepo.result, isSingleRepo, cwd])

  const gitRefresh = useCallback(() => {
    if (multiRepo.result.mode === 'multi') multiRepo.refresh()
    if (isSingleRepo) singleRepoGit.refresh()
  }, [multiRepo, isSingleRepo, singleRepoGit])

  const displayPath = useMemo(() => {
    if (!cwd) return ''
    return shortenPath(cwd)
  }, [cwd])

  const handleChangeFolder = useCallback(async () => {
    const folderPath = await window.electronAPI?.openFolderDialog()
    if (folderPath) {
      setCustomCwd(folderPath)
    }
  }, [setCustomCwd])

  const handleResetFolder = useCallback(() => {
    setCustomCwd(null)
  }, [setCustomCwd])

  const handleNavigateToFolder = useCallback(
    (absolutePath: string) => {
      setCustomCwd(absolutePath)
    },
    [setCustomCwd]
  )

  // Are we navigated into a subfolder of the session's cwd?
  const isNavigatedSubfolder = !!(
    cwd && sessionCwd && cwd !== sessionCwd && cwd.startsWith(sessionCwd + '/')
  )

  // Breadcrumb segments when navigated into a subfolder
  const breadcrumbSegments = useMemo(() => {
    if (!isNavigatedSubfolder || !sessionCwd || !cwd) return []
    const sessionFolderName = sessionCwd.split('/').pop() ?? sessionCwd
    const relativePath = cwd.slice(sessionCwd.length + 1)
    const parts = relativePath.split('/')
    const segments: { label: string; path: string }[] = [
      { label: sessionFolderName, path: sessionCwd }
    ]
    for (let i = 0; i < parts.length; i++) {
      segments.push({
        label: parts[i],
        path: sessionCwd + '/' + parts.slice(0, i + 1).join('/')
      })
    }
    return segments
  }, [isNavigatedSubfolder, sessionCwd, cwd])

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
    <div className="flex flex-col h-full bg-surface-50">
      {/* Header — the panel's chrome, and the window's drag region; every
          interactive child opts out. No rule under it: the bars ARE the chrome,
          exactly as the sidebar's launcher and switcher panels are, and a line
          under them only says again what the panel edge already said.

          The gap between the two rows is the content column's gap-2, not the
          sidebar's 4px between launcher and switcher: the tab bar sits level
          with the toolbar, so the box under it is this edge's launcher and has
          to land on the terminal card's top edge (--content-top-offset), the
          way the sidebar's launcher does across the other divide. At 4px it
          started four pixels above the card and read as misaligned. */}
      <div
        className="flex flex-col gap-2 px-2 pt-2 pb-1 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Row 1 — which tab, and nothing else. The controls that used to sit
            out here (the folder picker, collapse-all, help) have gone: the first
            two belong to WHERE the panel is pointed, which is the row below, and
            help was a button in the panel's corner for a panel that is not
            about help — ⌘? still opens it. What is left is the one choice this
            row was ever for, so the bar is the width of that choice and sits
            centred, rather than a full-width box with two buttons adrift in
            it. */}
        <div
          className="panel-bar panel-bar--hug"
          data-panel-bar="tabs"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => setSidePanelTab('files')}
            className="panel-tab"
            data-selected={effectiveTab === 'files' ? 'true' : undefined}
          >
            <DocumentTextIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Files</span>
          </button>
          {!isRemoteSession && (
            <button
              onClick={() => setSidePanelTab('git')}
              className="panel-tab"
              data-selected={effectiveTab === 'git' ? 'true' : undefined}
            >
              {/* Heroicons has no branch glyph — the one hand-rolled icon the
                  convention leaves room for. */}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                <circle cx="6" cy="1.5" r="1.25" stroke="currentColor" strokeWidth="1.1" />
                <circle cx="3" cy="10.5" r="1.25" stroke="currentColor" strokeWidth="1.1" />
                <circle cx="9" cy="10.5" r="1.25" stroke="currentColor" strokeWidth="1.1" />
                <path d="M6 2.75v3.5" stroke="currentColor" strokeWidth="1.1" />
                <path d="M6 6.25L3 9.25" stroke="currentColor" strokeWidth="1.1" />
                <path d="M6 6.25l3 3" stroke="currentColor" strokeWidth="1.1" />
              </svg>
              <span>Git</span>
            </button>
          )}
        </div>

        {/* Row 2 — where you are, as one control. The folder picker opens it, the
            path names it and drops the parents, the back arrow and the way home
            flank it, and collapse-all closes what it opened: every one of them is
            about the folder this panel is pointed at, so they are one bar rather
            than a naked line of text with its own controls stranded a row above.
            It does not wrap — a long path truncates, which is what a path is for;
            wrapping would drop collapse-all onto a second line at every width. */}
        {effectiveTab !== 'help' && (
          <div
            className="panel-bar panel-bar--nowrap relative"
            data-panel-bar="path"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {canGoBack && (
              <IconButton
                onClick={goBack}
                className="panel-icon-btn"
                aria-label="Go back"
                tooltip="Go back"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </IconButton>
            )}
            <IconButton
              onClick={handleChangeFolder}
              className="panel-icon-btn"
              aria-label="Open another folder"
              tooltip="Open another folder"
            >
              <FolderOpenIcon className="w-3.5 h-3.5" />
            </IconButton>
            {/* The slack beside a truncated path is the window's drag band —
                it was one before the row became a box, and it is the only one
                left at this corner of the window now that both bars opt out.
                Everything readable inside it opts back in, the way every other
                control in the panel's chrome does. */}
            <div
              className="flex-1 min-w-0 px-0.5"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
              {isRemoteSession && locationName ? (
                <div
                  className="flex items-center gap-1.5 text-xs font-medium text-text-secondary truncate"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="truncate">{locationName}</span>
                  {effectiveCwd && (
                    <>
                      <span className="text-text-tertiary">:</span>
                      <span className="text-text-tertiary truncate">{effectiveCwd}</span>
                    </>
                  )}
                </div>
              ) : isNavigatedSubfolder ? (
                <div
                  className="flex items-center gap-0.5 text-xs font-medium min-w-0 overflow-hidden"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  onDoubleClick={() => setCustomCwd(null)}
                  title="Double-click to reset to session folder"
                >
                  {breadcrumbSegments.map((seg, i) => (
                    <span key={seg.path} className="flex items-center min-w-0">
                      {i > 0 && (
                        <span className="text-text-tertiary mx-0.5 flex-shrink-0">/</span>
                      )}
                      <button
                        onClick={() => {
                          if (seg.path === sessionCwd) {
                            setCustomCwd(null)
                          } else {
                            setCustomCwd(seg.path)
                          }
                        }}
                        className={`truncate hover:text-text-primary transition-colors ${
                          i === breadcrumbSegments.length - 1
                            ? 'text-text-primary'
                            : 'text-text-tertiary hover:underline'
                        }`}
                      >
                        {seg.label}
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <button
                  ref={pathButtonRef}
                  onClick={() => cwd && setPathMenuOpen((v) => !v)}
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  className="max-w-full text-left text-xs text-text-secondary font-medium truncate hover:text-text-primary cursor-pointer transition-colors"
                  title={cwd ?? ''}
                >
                  {displayPath}
                </button>
              )}
            </div>

            {isCustom && (
              <IconButton
                onClick={handleResetFolder}
                className="panel-icon-btn"
                aria-label="Back to the session's folder"
                tooltip="Back to the session's folder"
              >
                <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
              </IconButton>
            )}
            <span className="panel-sep" aria-hidden="true" />
            <CollapseAllButton />

            {pathMenuOpen && parentPaths.length > 0 && (
              <div
                ref={pathMenuRef}
                className="menu-surface menu-pop-mount fixed z-50 min-w-[180px] max-w-[320px] p-1"
                style={{
                  top: (pathButtonRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  right:
                    document.documentElement.clientWidth -
                    (pathButtonRef.current?.getBoundingClientRect().right ?? 0)
                }}
              >
                {/* The scroll lives one level in: the surface clips its own
                    corners, so it cannot also be the thing that scrolls. */}
                <div className="max-h-[60vh] overflow-y-auto">
                {parentPaths.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => {
                      setCustomCwd(item.path)
                      setPathMenuOpen(false)
                    }}
                    className="menu-item"
                    data-selected={item.path === cwd}
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* The git tab's own bar. Same panel as the tab bar above it, so the two
          stack as one block of chrome. It wraps rather than clips: a branch
          name, three badges and six controls do not fit the 240px default
          width, and a second line inside the panel reads as intended where the
          old loose row running toward the edge did not. */}
      {isGitTabActive && !isRemoteSession && multiRepo.result.mode !== 'none' && multiRepo.result.mode !== 'loading' && (
        <div className="px-2 pb-1.5 flex-shrink-0">
          <div className="panel-bar panel-bar--nowrap" data-panel-bar="git">
            {/* Branch name (single-repo only). The badges sit outside the
                truncating name so a long branch never clips them away — they are
                the toolbar's controls, the name is only a label. */}
            {isSingleRepo && singleRepoGit.status?.branch && (
              <span className="flex items-center gap-1 pl-1.5 text-xs text-text-secondary min-w-0">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 text-text-tertiary">
                  <circle cx="6" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="6" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 4v4" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span className="truncate min-w-0">{singleRepoGit.status.branch}</span>
              </span>
            )}
            {/* A folder of repos has no one branch, so the bar's left half says
                what it does have. The per-repo change counts are on the rows
                themselves — a total here only cost the label its own word. */}
            {multiRepo.result.mode === 'multi' && (
              <span className="pl-1.5 text-xs text-text-secondary truncate min-w-0">
                {multiRepo.result.repos.length} repo{multiRepo.result.repos.length === 1 ? '' : 's'}
              </span>
            )}
            {isSingleRepo && singleRepoGit.status && (
              <span className="flex items-center gap-1 flex-shrink-0">
                {singleRepoGit.status.ahead > 0 && (
                  <GitSyncBadge
                    tone="outgoing"
                    count={singleRepoGit.status.ahead}
                    active={showOutgoingSingle}
                    onToggle={() => setShowOutgoingSingle((v) => !v)}
                    title="Show what a push will send"
                  />
                )}
                {singleRepoGit.status.behind > 0 && (
                  <GitSyncBadge
                    tone="incoming"
                    count={singleRepoGit.status.behind}
                    active={showIncomingSingle}
                    onToggle={() => setShowIncomingSingle((v) => !v)}
                    title="Show what a pull will bring"
                  />
                )}
                {singleRepoChangeCount > 0 && (
                  <GitSyncBadge
                    tone="changes"
                    count={singleRepoChangeCount}
                    active={showChangesSingle}
                    onToggle={() => setShowChangesSingle((v) => !v)}
                    title={showChangesSingle ? 'Hide local changes' : 'Show local changes'}
                  />
                )}
              </span>
            )}
            {/* Parent-repo notice — opened folder isn't a repo, changes come from above */}
            {isSingleRepo &&
              !isNavigatedSubfolder &&
              singleRepoGit.status?.repoRoot &&
              cwd &&
              singleRepoGit.status.repoRoot !== cwd && (
                <span className="flex items-center gap-1 text-[10px] text-text-tertiary truncate min-w-0">
                  <InformationCircleIcon className="w-3 h-3 flex-shrink-0" />
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <span className="truncate cursor-default">
                        Part of {singleRepoGit.status.repoRoot.split(/[\\/]/).pop() || singleRepoGit.status.repoRoot}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="font-mono max-w-[300px]">
                      This folder isn’t a git repository. The changes shown belong to the parent repository {shortenPath(singleRepoGit.status.repoRoot)}, which contains it.
                    </TooltipContent>
                  </Tooltip>
                </span>
              )}
            {/* Three segments, hairlined apart: what reaches the remote, what
                opens a panel over the repo, what changes how the list is drawn.
                Collapse-all is gone from here — it is in the tab bar above,
                where the file tree can reach it too. */}
            <span className="panel-bar-spacer" />
            <span className="panel-sep" aria-hidden="true" />
            {/* One cluster that never breaks apart — see .panel-bar--nowrap. */}
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <MagicPullButton repoPaths={allRepoPaths} onDone={gitRefresh} />
              <MagicSyncButton repoPaths={allRepoPaths} onDone={gitRefresh} />
              <span className="panel-sep" aria-hidden="true" />
              <CommitBarToggle />
              {isSingleRepo && cwd && (
                <JourneyButton cwd={cwd} repoName={cwd.split('/').pop() ?? cwd} />
              )}
              <span className="panel-sep" aria-hidden="true" />
              <PanelModeToggle />
              <ViewModeToggle />
  </span>
          </div>
        </div>
      )}

      {/* Active tab content */}
      {effectiveTab === 'help' ? (
        <HelpPanel />
      ) : isRemoteSession && remoteLocationId && effectiveCwd && effectiveCwd !== '' && effectiveCwd !== '~' && effectiveCwd.startsWith('/') ? (
        <RemoteFileTree locationId={remoteLocationId} cwd={effectiveCwd} />
      ) : isRemoteSession ? (
        <div className="flex-1 flex items-center justify-center px-3">
          <span className="text-xs text-text-tertiary text-center">No working directory</span>
        </div>
      ) : (
        <>
          {/* Keep FileTree mounted across tab switches so folder expansion state is preserved */}
          <div className={sidePanelTab === 'files' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
            <FileTree cwd={cwd} onNavigateToFolder={handleNavigateToFolder} />
          </div>
          {sidePanelTab === 'git' && (
            multiRepo.result.mode === 'multi' ? (
              <MultiRepoGitPanel
                repos={multiRepo.result.repos}
                rootPath={multiRepo.hasNestedRepos ? cwd : null}
                basePath={cwd}
                refresh={multiRepo.refresh}
                truncated={multiRepo.result.truncated}
                live={multiRepo.result.live}
                refreshing={multiRepo.refreshing}
                lastUpdated={multiRepo.lastUpdated}
              />
            ) : multiRepo.result.mode === 'none' ? (
              <div className="flex-1 flex items-center justify-center px-3">
                <span className="text-xs text-text-tertiary text-center">Not a git repository</span>
              </div>
            ) : (
              <GitStatusPanel
                cwd={cwd}
                isActive={isGitTabActive}
                filterPrefix={isNavigatedSubfolder ? cwd : null}
                externalStatus={singleRepoGit.status}
                externalRefresh={singleRepoGit.refresh}
                showIncoming={showIncomingSingle}
                showOutgoing={showOutgoingSingle}
                showChanges={showChangesSingle}
              />
            )
          )}
        </>
      )}
    </div>
  )
}
