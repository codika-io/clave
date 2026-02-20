import { useState, useEffect, useCallback, useRef } from 'react'
import type { GitStatusResult } from '../../../preload/index.d'

const POLL_INTERVAL = 5000
const FETCH_INTERVAL = 30000

export type MultiRepoMode =
  | { mode: 'single' }
  | { mode: 'multi'; repos: Array<{ name: string; path: string; status: GitStatusResult }> }
  | { mode: 'none' }
  | { mode: 'loading' }

export function useMultiRepoStatus(
  cwd: string | null,
  active: boolean
): { result: MultiRepoMode; refresh: () => void } {
  const [result, setResult] = useState<MultiRepoMode>({ mode: 'loading' })
  const cwdRef = useRef(cwd)

  const fetchAll = useCallback(async () => {
    if (!cwd || !window.electronAPI) return

    const status = await window.electronAPI.getGitStatus(cwd)
    if (cwdRef.current !== cwd) return

    if (status.isRepo) {
      setResult({ mode: 'single' })
      return
    }

    const repos = await window.electronAPI.discoverGitRepos(cwd)
    if (cwdRef.current !== cwd) return

    if (repos.length === 0) {
      setResult({ mode: 'none' })
      return
    }

    const repoStatuses = await Promise.all(
      repos.map(async (repo) => {
        const repoStatus = await window.electronAPI.getGitStatus(repo.path)
        return { name: repo.name, path: repo.path, status: repoStatus }
      })
    )
    if (cwdRef.current !== cwd) return

    setResult({ mode: 'multi', repos: repoStatuses })
  }, [cwd])

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

  // Only poll in multi mode (single mode uses useGitStatus for its own polling)
  useEffect(() => {
    if (!cwd || !active || result.mode !== 'multi') return
    const interval = setInterval(fetchAll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [cwd, active, fetchAll, result.mode])

  // Periodic git fetch for all repos in multi mode
  useEffect(() => {
    if (!cwd || !active || result.mode !== 'multi') return
    const repos = result.repos
    for (const repo of repos) {
      window.electronAPI.gitFetch(repo.path)
    }
    const interval = setInterval(() => {
      for (const repo of repos) {
        window.electronAPI.gitFetch(repo.path)
      }
    }, FETCH_INTERVAL)
    return () => clearInterval(interval)
  }, [cwd, active, result])

  const refresh = useCallback(() => {
    fetchAll()
  }, [fetchAll])

  return { result, refresh }
}
