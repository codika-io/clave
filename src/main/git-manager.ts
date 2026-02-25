import simpleGit, { type StatusResult } from 'simple-git'
import * as fs from 'fs'
import * as path from 'path'

export interface GitFileStatus {
  path: string
  status:
    | 'staged'
    | 'modified'
    | 'deleted'
    | 'untracked'
    | 'staged-modified'
    | 'staged-deleted'
    | 'renamed'
  staged: boolean
}

export interface GitStatusResult {
  isRepo: boolean
  branch: string
  ahead: number
  behind: number
  files: GitFileStatus[]
  repoRoot: string
}

export interface GitCommitResult {
  hash: string
  branch: string
}

export interface GitLogEntry {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  refs: string[]
}

export interface GitCommitFileStatus {
  path: string
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T'
  insertions: number
  deletions: number
}

function mapFiles(status: StatusResult): GitFileStatus[] {
  const files: GitFileStatus[] = []

  for (const file of status.files) {
    const index = file.index
    const working = file.working_dir

    // Staged changes
    if (index === 'A') {
      files.push({ path: file.path, status: 'staged', staged: true })
    } else if (index === 'M') {
      if (working === 'M') {
        files.push({ path: file.path, status: 'staged-modified', staged: true })
      } else {
        files.push({ path: file.path, status: 'staged', staged: true })
      }
    } else if (index === 'D') {
      files.push({ path: file.path, status: 'staged-deleted', staged: true })
    } else if (index === 'R') {
      files.push({ path: file.path, status: 'renamed', staged: true })
    }

    // Unstaged changes (only if not already covered by staged)
    if (index === ' ' || index === '?') {
      if (working === 'M') {
        files.push({ path: file.path, status: 'modified', staged: false })
      } else if (working === 'D') {
        files.push({ path: file.path, status: 'deleted', staged: false })
      } else if (working === '?') {
        files.push({ path: file.path, status: 'untracked', staged: false })
      }
    }

    // Unstaged modification on top of staged change
    if ((index === 'A' || index === 'R') && working === 'M') {
      files.push({ path: file.path, status: 'modified', staged: false })
    }
  }

  return files
}

class GitManager {
  async discoverRepos(cwd: string): Promise<Array<{ name: string; path: string }>> {
    const SKIP = new Set(['.git', 'node_modules'])
    const MAX_DEPTH = 2
    const repos: Array<{ name: string; path: string }> = []

    const scan = async (dir: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH) return
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true })
        await Promise.all(
          entries
            .filter((e) => e.isDirectory() && !SKIP.has(e.name))
            .map(async (e) => {
              const dirPath = path.join(dir, e.name)
              try {
                await fs.promises.access(path.join(dirPath, '.git'))
                repos.push({ name: e.name, path: dirPath })
              } catch {
                // Not a repo — recurse deeper
                if (depth < MAX_DEPTH) {
                  await scan(dirPath, depth + 1)
                }
              }
            })
        )
      } catch {
        // unreadable directory
      }
    }

    await scan(cwd, 1)
    return repos.sort((a, b) => a.name.localeCompare(b.name))
  }

  async getDiff(
    cwd: string,
    filePath: string,
    staged: boolean,
    isUntracked: boolean
  ): Promise<string> {
    if (isUntracked) {
      const fullPath = path.join(cwd, filePath)
      return await fs.promises.readFile(fullPath, 'utf-8')
    }
    const git = simpleGit(cwd)
    if (staged) {
      return await git.diff(['--cached', '--', filePath])
    }
    return await git.diff(['--', filePath])
  }

  async stage(cwd: string, files: string[]): Promise<void> {
    const git = simpleGit(cwd)
    await git.add(files)
  }

  async unstage(cwd: string, files: string[]): Promise<void> {
    const git = simpleGit(cwd)
    await git.raw(['reset', 'HEAD', '--', ...files])
  }

  async commit(cwd: string, message: string): Promise<GitCommitResult> {
    const git = simpleGit(cwd)
    const result = await git.commit(message)
    return { hash: result.commit, branch: result.branch }
  }

  async push(cwd: string): Promise<void> {
    const git = simpleGit(cwd)
    await git.push()
  }

  async pull(cwd: string, strategy: 'auto' | 'merge' | 'rebase' | 'ff-only' = 'auto'): Promise<void> {
    const git = simpleGit(cwd)

    if (strategy === 'ff-only') {
      await git.pull(['--ff-only'])
      return
    }

    if (strategy === 'merge') {
      await git.pull(['--no-rebase', '--autostash'])
      return
    }

    if (strategy === 'rebase') {
      try {
        await git.pull(['--rebase', '--autostash'])
      } catch (err) {
        try { await git.rebase(['--abort']) } catch { /* abort may fail if rebase didn't start */ }
        throw err
      }
      return
    }

    // strategy === 'auto': try ff-only, then fall back to merge
    try {
      await git.pull(['--ff-only'])
    } catch {
      await git.pull(['--no-rebase', '--autostash'])
    }
  }

  async discard(
    cwd: string,
    files: Array<{ path: string; status: string; staged: boolean }>
  ): Promise<void> {
    const git = simpleGit(cwd)

    const stagedTracked: string[] = []
    const trackedOnly: string[] = []
    const untrackedPaths: string[] = []

    for (const f of files) {
      if (f.status === 'untracked') {
        untrackedPaths.push(f.path)
      } else if (f.staged) {
        stagedTracked.push(f.path)
      } else {
        trackedOnly.push(f.path)
      }
    }

    // Unstage staged files first, then revert
    if (stagedTracked.length > 0) {
      await git.raw(['reset', 'HEAD', '--', ...stagedTracked])
      await git.raw(['checkout', '--', ...stagedTracked])
    }

    // Revert unstaged tracked files
    if (trackedOnly.length > 0) {
      await git.raw(['checkout', '--', ...trackedOnly])
    }

    // Delete untracked files from filesystem
    for (const filePath of untrackedPaths) {
      await fs.promises.unlink(path.join(cwd, filePath)).catch(() => {})
    }
  }

  async fetch(cwd: string): Promise<void> {
    try {
      const git = simpleGit(cwd)
      await git.fetch()
    } catch {
      // silently ignore — offline, no remote, auth issues
    }
  }

  async checkIgnored(cwd: string, paths: string[]): Promise<string[]> {
    if (paths.length === 0) return []
    try {
      const git = simpleGit(cwd)
      const isRepo = await git.checkIsRepo()
      if (!isRepo) return []
      // git check-ignore returns the paths that ARE ignored (exit code 1 = none ignored)
      const result = await git.raw(['check-ignore', ...paths]).catch(() => '')
      if (!result.trim()) return []
      return result.trim().split('\n').filter(Boolean)
    } catch {
      return []
    }
  }

  async getLog(
    cwd: string,
    maxCount: number = 100
  ): Promise<GitLogEntry[]> {
    try {
      const git = simpleGit(cwd)
      const result = await git.log({
        maxCount,
        format: {
          hash: '%H',
          shortHash: '%h',
          message: '%s',
          author: '%an',
          date: '%aI',
          refs: '%D'
        }
      })
      return result.all.map((entry) => ({
        hash: entry.hash,
        shortHash: entry.shortHash,
        message: entry.message,
        author: entry.author,
        date: entry.date,
        refs: entry.refs
          ? entry.refs.split(', ').filter(Boolean)
          : []
      }))
    } catch {
      return []
    }
  }

  async getOutgoingCommits(cwd: string): Promise<GitLogEntry[]> {
    try {
      const git = simpleGit(cwd)
      const branch = (await git.status()).current
      if (!branch) return []
      const result = await git.log({
        from: `origin/${branch}`,
        to: 'HEAD',
        format: {
          hash: '%H',
          shortHash: '%h',
          message: '%s',
          author: '%an',
          date: '%aI',
          refs: '%D'
        }
      })
      return result.all.map((entry) => ({
        hash: entry.hash,
        shortHash: entry.shortHash,
        message: entry.message,
        author: entry.author,
        date: entry.date,
        refs: entry.refs ? entry.refs.split(', ').filter(Boolean) : []
      }))
    } catch {
      return []
    }
  }

  async getIncomingCommits(cwd: string): Promise<GitLogEntry[]> {
    try {
      const git = simpleGit(cwd)
      const branch = (await git.status()).current
      if (!branch) return []
      const result = await git.log({
        from: 'HEAD',
        to: `origin/${branch}`,
        format: {
          hash: '%H',
          shortHash: '%h',
          message: '%s',
          author: '%an',
          date: '%aI',
          refs: '%D'
        }
      })
      return result.all.map((entry) => ({
        hash: entry.hash,
        shortHash: entry.shortHash,
        message: entry.message,
        author: entry.author,
        date: entry.date,
        refs: entry.refs ? entry.refs.split(', ').filter(Boolean) : []
      }))
    } catch {
      return []
    }
  }

  async getCommitFiles(cwd: string, hash: string): Promise<GitCommitFileStatus[]> {
    try {
      const git = simpleGit(cwd)
      const raw = await git.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', '--diff-filter=AMDRTC', hash])
      const nameRaw = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', '--diff-filter=AMDRTC', hash])

      const numLines = raw.trim().split('\n').filter(Boolean)
      const nameLines = nameRaw.trim().split('\n').filter(Boolean)

      const files: GitCommitFileStatus[] = []
      for (let i = 0; i < nameLines.length; i++) {
        const nameParts = nameLines[i].split('\t')
        const statusChar = nameParts[0].charAt(0) as GitCommitFileStatus['status']
        const filePath = nameParts[nameParts.length - 1]

        let insertions = 0
        let deletions = 0
        if (numLines[i]) {
          const numParts = numLines[i].split('\t')
          insertions = numParts[0] === '-' ? 0 : parseInt(numParts[0], 10) || 0
          deletions = numParts[1] === '-' ? 0 : parseInt(numParts[1], 10) || 0
        }

        files.push({ path: filePath, status: statusChar, insertions, deletions })
      }
      return files
    } catch {
      return []
    }
  }

  async getCommitDiff(cwd: string, hash: string, filePath: string): Promise<string> {
    try {
      const git = simpleGit(cwd)
      return await git.raw(['diff', `${hash}~1`, hash, '--', filePath])
    } catch {
      // For initial commits (no parent), use show
      try {
        const git = simpleGit(cwd)
        return await git.raw(['show', `${hash}:${filePath}`])
      } catch {
        return ''
      }
    }
  }

  async getStatus(cwd: string): Promise<GitStatusResult> {
    try {
      const git = simpleGit(cwd)
      const isRepo = await git.checkIsRepo()

      if (!isRepo) {
        return { isRepo: false, branch: '', ahead: 0, behind: 0, files: [], repoRoot: '' }
      }

      const [status, repoRoot] = await Promise.all([
        git.status(),
        git.revparse(['--show-toplevel']).then((r) => r.trim())
      ])

      return {
        isRepo: true,
        branch: status.current ?? '',
        ahead: status.ahead,
        behind: status.behind,
        files: mapFiles(status),
        repoRoot
      }
    } catch {
      return { isRepo: false, branch: '', ahead: 0, behind: 0, files: [], repoRoot: '' }
    }
  }
}

export const gitManager = new GitManager()
