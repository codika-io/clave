import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { GitStatusResult } from '../../../preload/index.d'

const POLL_INTERVAL = 5000
const FETCH_INTERVAL = 30000

/**
 * Above this many repos the panel does a one-shot load and stops auto-polling /
 * fetching (manual refresh only). Mirrors MULTI_REPO_LIVE_POLL_MAX in the main
 * process — keeps huge trees (e.g. "/") from spawning a perpetual cascade.
 */
const LIVE_POLL_MAX = 50

type RepoEntry = { name: string; path: string; status: GitStatusResult }

export type MultiRepoMode =
  | { mode: 'single' }
  | { mode: 'multi'; repos: RepoEntry[]; truncated: boolean; live: boolean }
  | { mode: 'none' }
  | { mode: 'loading' }

export function useMultiRepoStatus(
  cwd: string | null,
  active: boolean
): { result: MultiRepoMode; refresh: () => void; hasNestedRepos: boolean } {
  const [result, setResult] = useState<MultiRepoMode>({ mode: 'loading' })
  const [hasNestedRepos, setHasNestedRepos] = useState(false)
  const cwdRef = useRef(cwd)

  const fetchAll = useCallback(
    async (force = false) => {
      if (!cwd || !window.electronAPI) return

      const status = await window.electronAPI.getGitStatus(cwd)
      if (cwdRef.current !== cwd) return

      if (status.isRepo) {
        const { repos: nested } = await window.electronAPI.discoverGitRepos(cwd, force)
        if (cwdRef.current !== cwd) return

        setHasNestedRepos(nested.length > 0)

        if (nested.length === 0) {
          setResult({ mode: 'single' })
          return
        }

        // Root + nested repos. Reuse the status we already have for the root.
        const rootName = cwd.split(/[\\/]/).pop() ?? cwd
        const nameByPath = new Map<string, string>([[cwd, rootName]])
        for (const r of nested) nameByPath.set(r.path, r.name)

        const allPaths = [cwd, ...nested.map((r) => r.path)]
        const live = allPaths.length <= LIVE_POLL_MAX
        const statuses = await window.electronAPI.getGitStatusBatch(nested.map((r) => r.path))
        if (cwdRef.current !== cwd) return

        const repos: RepoEntry[] = [
          { name: rootName, path: cwd, status },
          ...statuses.map((s) => ({
            name: nameByPath.get(s.path) ?? s.path,
            path: s.path,
            status: s.status
          }))
        ]
        setResult({ mode: 'multi', repos, truncated: false, live })
        return
      }

      // CWD is not a repo — discover repos in children
      setHasNestedRepos(false)

      const { repos: discovered, truncated } = await window.electronAPI.discoverGitRepos(cwd, force)
      if (cwdRef.current !== cwd) return

      if (discovered.length === 0) {
        setResult({ mode: 'none' })
        return
      }

      const live = discovered.length <= LIVE_POLL_MAX
      const nameByPath = new Map(discovered.map((r) => [r.path, r.name]))
      const statuses = await window.electronAPI.getGitStatusBatch(discovered.map((r) => r.path))
      if (cwdRef.current !== cwd) return

      const repos: RepoEntry[] = statuses.map((s) => ({
        name: nameByPath.get(s.path) ?? s.path,
        path: s.path,
        status: s.status
      }))
      setResult({ mode: 'multi', repos, truncated, live })
    },
    [cwd]
  )

  // Reset + initial fetch when cwd or active changes
  useEffect(() => {
    cwdRef.current = cwd
    if (!cwd || !active) {
      setResult({ mode: 'loading' })
      return
    }
    setResult({ mode: 'loading' })
    fetchAll()
  }, [cwd, active, fetchAll])

  // Only poll in multi mode that is "live" (small enough). Single mode uses
  // useGitStatus for its own polling.
  const isLiveMulti = result.mode === 'multi' && result.live
  useEffect(() => {
    if (!cwd || !active || !isLiveMulti) return
    const interval = setInterval(fetchAll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [cwd, active, fetchAll, isLiveMulti])

  // Stable key for repo paths — only changes when repos are added/removed, not on status polls
  const repoPaths = useMemo(() => {
    if (result.mode !== 'multi') return ''
    return result.repos
      .map((r) => r.path)
      .sort()
      .join('\n')
  }, [result])

  // Periodic git fetch for all repos in live multi mode (bounded concurrency)
  useEffect(() => {
    if (!cwd || !active || !isLiveMulti || !repoPaths) return
    const paths = repoPaths.split('\n').filter(Boolean)
    if (paths.length === 0) return
    window.electronAPI.gitFetchBatch(paths)
    const interval = setInterval(() => {
      window.electronAPI.gitFetchBatch(paths)
    }, FETCH_INTERVAL)
    return () => clearInterval(interval)
  }, [cwd, active, isLiveMulti, repoPaths])

  const refresh = useCallback(() => {
    fetchAll(true)
  }, [fetchAll])

  return { result, refresh, hasNestedRepos }
}
