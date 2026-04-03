import simpleGit, { type StatusResult } from 'simple-git'
import { execFile } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getLoginShellEnv } from './pty-manager'

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

export interface GitPushGroup {
  id: string
  pushedAt: string
  commits: GitLogEntry[]
  summary?: {
    title: string
    description: string
  }
}

export interface GitJourneyResult {
  local: GitLogEntry[]
  pushGroups: GitPushGroup[]
  fallbackMode: boolean
  branch: string
  hasMore: boolean
}

export type MagicSyncStep = 'pulling' | 'staging' | 'generating' | 'committing' | 'pushing'
export type MagicPullStep = 'fetching' | 'pulling'

export interface MagicSyncResult {
  repoPath: string
  actions: string[]
  error: string | null
}

export interface MagicPullResult {
  repoPath: string
  pulled: boolean
  error: string | null
}

/** Format object for simple-git log calls */
const GIT_LOG_FORMAT = {
  hash: '%H',
  shortHash: '%h',
  message: '%s',
  author: '%an',
  date: '%aI',
  refs: '%D'
}

/** Parse raw log entries from simple-git into GitLogEntry[] */
function parseLogEntries(
  entries: ReadonlyArray<{ hash: string; shortHash: string; message: string; author: string; date: string; refs: string }>
): GitLogEntry[] {
  return entries.map((entry) => ({
    hash: entry.hash,
    shortHash: entry.shortHash,
    message: entry.message,
    author: entry.author,
    date: entry.date,
    refs: entry.refs ? entry.refs.split(', ').filter(Boolean) : []
  }))
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
    const MAX_DEPTH = 5
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
        try { await git.rebase(['--abort']) } catch { /* expected: abort may fail if rebase didn't start */ }
        throw err
      }
      return
    }

    // strategy === 'auto': try ff-only, then fall back to rebase
    try {
      await git.pull(['--ff-only'])
    } catch {
      try {
        await git.pull(['--rebase', '--autostash'])
      } catch (err) {
        try { await git.rebase(['--abort']) } catch { /* abort may fail if rebase didn't start */ }
        throw err
      }
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
      await fs.promises.unlink(path.join(cwd, filePath)).catch((err) => {
        console.warn('[git] Failed to delete untracked file:', filePath, err.message)
      })
    }
  }

  async fetch(cwd: string): Promise<void> {
    try {
      const git = simpleGit(cwd)
      await git.fetch()
    } catch (err) {
      console.warn('[git] Fetch skipped:', (err as Error).message)
    }
  }

  async checkIgnored(cwd: string, paths: string[]): Promise<string[]> {
    if (paths.length === 0) return []
    try {
      const git = simpleGit(cwd)
      const isRepo = await git.checkIsRepo()
      if (!isRepo) return []
      // git check-ignore returns the paths that ARE ignored (exit code 1 = none ignored)
      // --no-index: check purely against .gitignore rules, ignoring tracked gitlinks
      // (nested git repos tracked in the index are otherwise silently skipped)
      const result = await git.raw(['check-ignore', '--no-index', ...paths]).catch(() => '')
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
      const result = await git.log({ maxCount, format: GIT_LOG_FORMAT })
      return parseLogEntries(result.all)
    } catch (err) {
      console.warn('[git] getLog failed:', (err as Error).message)
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
        format: GIT_LOG_FORMAT
      })
      return parseLogEntries(result.all)
    } catch {
      // Expected: no remote tracking branch
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
        format: GIT_LOG_FORMAT
      })
      return parseLogEntries(result.all)
    } catch {
      // Expected: no remote tracking branch
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
    } catch (err) {
      console.warn('[git] getCommitFiles failed:', hash, (err as Error).message)
      return []
    }
  }

  async getCommitDiff(cwd: string, hash: string, filePath: string): Promise<string> {
    try {
      const git = simpleGit(cwd)
      return await git.raw(['diff', `${hash}~1`, hash, '--', filePath])
    } catch {
      // Expected for initial commits (no parent) — fall back to show
      try {
        const git = simpleGit(cwd)
        return await git.raw(['show', `${hash}:${filePath}`])
      } catch (err) {
        console.warn('[git] getCommitDiff failed:', hash, filePath, (err as Error).message)
        return ''
      }
    }
  }

  async generateCommitMessage(cwd: string): Promise<string> {
    console.log('[git] generateCommitMessage called for:', cwd)
    const git = simpleGit(cwd)

    // Get staged diff (what will actually be committed)
    const diff = await git.diff(['--cached', '--stat']).then(async (stat) => {
      if (!stat.trim()) throw new Error('No staged changes — stage files first')
      const fullDiff = await git.diff(['--cached'])
      console.log('[git] Staged diff length:', fullDiff.length)
      // Truncate to ~12k chars to stay within reasonable prompt size
      return fullDiff.length > 12000 ? fullDiff.slice(0, 12000) + '\n... (diff truncated)' : fullDiff
    })

    // Get recent commit messages for style context
    const recentMessages = await this.getLog(cwd, 5).then((entries) =>
      entries.map((e) => e.message).join('\n')
    )

    const prompt = `Write a git commit message for the staged diff below.

Rules:
- First line: conventional commit prefix (feat/fix/refactor/chore/docs/style/perf/test) + concise summary, max 72 chars
- If the change is non-trivial, add a blank line then a body (1-3 bullet points) explaining WHAT was done and WHY — not which files were touched
- Maximize information density: an agent reading git log should understand the intent and scope without reading the diff
- No quotes around the message, no markdown formatting, no trailing explanation
- Match the tone and style of recent commits if provided

${recentMessages ? `Recent commits for style reference:\n${recentMessages}\n\n` : ''}Staged diff:
${diff}`

    const env = { ...getLoginShellEnv() }
    // Remove CLAUDECODE to avoid "nested session" detection
    delete env.CLAUDECODE

    console.log('[git] Spawning claude CLI for commit message generation...')
    return new Promise<string>((resolve, reject) => {
      const child = execFile('claude', ['-p', '--model', 'haiku'], {
        env,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        timeout: 30000
      }, (err, stdout, stderr) => {
        if (err) {
          console.error('[git] claude CLI error:', err.message, stderr)
          reject(new Error(stderr || err.message))
          return
        }
        const message = stdout.trim()
        if (!message) {
          console.error('[git] claude CLI returned empty output')
          reject(new Error('Empty response from Claude'))
          return
        }
        console.log('[git] Generated commit message:', message.slice(0, 80))
        resolve(message)
      })
      child.stdin?.write(prompt)
      child.stdin?.end()
    })
  }

  async magicSync(
    repoPaths: string[],
    onProgress?: (repoPath: string, step: MagicSyncStep) => void
  ): Promise<MagicSyncResult[]> {
    const results: MagicSyncResult[] = []

    for (const repoPath of repoPaths) {
      const result: MagicSyncResult = { repoPath, actions: [], error: null }
      try {
        const status = await this.getStatus(repoPath)
        if (!status.isRepo) {
          result.error = 'Not a git repository'
          results.push(result)
          continue
        }

        // 1. Pull if behind
        if (status.behind > 0) {
          onProgress?.(repoPath, 'pulling')
          await this.pull(repoPath, 'auto')
          result.actions.push('pulled')
        }

        // Re-check status after pull (files may have changed)
        const postPullStatus = status.behind > 0 ? await this.getStatus(repoPath) : status
        const files = postPullStatus.files

        if (files.length === 0) {
          // Nothing to commit — but maybe we pulled, so check if we need to push
          if (postPullStatus.ahead > 0) {
            onProgress?.(repoPath, 'pushing')
            await this.push(repoPath)
            result.actions.push('pushed')
          }
          results.push(result)
          continue
        }

        // 2. Stage all files
        onProgress?.(repoPath, 'staging')
        const allPaths = files.map((f) => f.path)
        await this.stage(repoPath, allPaths)
        result.actions.push('staged')

        // 3. Generate commit message
        onProgress?.(repoPath, 'generating')
        const message = await this.generateCommitMessage(repoPath)
        result.actions.push('generated')

        // 4. Commit
        onProgress?.(repoPath, 'committing')
        await this.commit(repoPath, message)
        result.actions.push('committed')

        // 5. Push
        onProgress?.(repoPath, 'pushing')
        await this.push(repoPath)
        result.actions.push('pushed')
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err)
      }
      results.push(result)
    }

    return results
  }

  async magicPull(
    repoPaths: string[],
    onProgress?: (repoPath: string, step: MagicPullStep) => void
  ): Promise<MagicPullResult[]> {
    const results: MagicPullResult[] = []

    for (const repoPath of repoPaths) {
      const result: MagicPullResult = { repoPath, pulled: false, error: null }
      try {
        const status = await this.getStatus(repoPath)
        if (!status.isRepo) {
          result.error = 'Not a git repository'
          results.push(result)
          continue
        }

        // 1. Fetch to update remote refs
        onProgress?.(repoPath, 'fetching')
        await this.fetch(repoPath)

        // Re-check status after fetch to see if there are incoming commits
        const postFetchStatus = await this.getStatus(repoPath)

        // 2. Pull if behind
        if (postFetchStatus.behind > 0) {
          onProgress?.(repoPath, 'pulling')
          await this.pull(repoPath, 'auto')
          result.pulled = true
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err)
      }
      results.push(result)
    }

    return results
  }

  async getJourney(cwd: string, maxCount: number = 200): Promise<GitJourneyResult> {
    try {
      const git = simpleGit(cwd)
      const branch = (await git.status()).current
      if (!branch) return { local: [], pushGroups: [], fallbackMode: false, branch: '', hasMore: false }

      // Fetch outgoing (unpushed) commits and full log in parallel
      const [local, log] = await Promise.all([
        this.getOutgoingCommits(cwd),
        this.getLog(cwd, maxCount)
      ])

      const localHashes = new Set(local.map((c) => c.hash))
      const pushedCommits = log.filter((c) => !localHashes.has(c.hash))

      // Try reflog-based grouping
      let pushGroups: GitPushGroup[] = []
      let fallbackMode = false

      try {
        const reflogRaw = await git.raw([
          'reflog', 'show', `origin/${branch}`,
          '--format=%H|%aI|%gs',
          '-n', '200'
        ])

        const pushEvents: Array<{ hash: string; date: string }> = []
        for (const line of reflogRaw.trim().split('\n')) {
          if (!line.trim()) continue
          const parts = line.split('|')
          if (parts.length < 3) continue
          const gs = parts.slice(2).join('|')
          if (gs.includes('update by push')) {
            pushEvents.push({ hash: parts[0], date: parts[1] })
          }
        }

        if (pushEvents.length > 0) {
          const assigned = new Set<string>()

          // For each push event, walk from its tip backwards to find commits in this push
          for (let i = 0; i < pushEvents.length; i++) {
            const pushEvent = pushEvents[i]
            const nextPushHash = i + 1 < pushEvents.length ? pushEvents[i + 1].hash : null

            const groupCommits: GitLogEntry[] = []
            let collecting = false

            for (const commit of pushedCommits) {
              if (assigned.has(commit.hash)) continue

              if (commit.hash === pushEvent.hash) collecting = true

              if (collecting) {
                groupCommits.push(commit)
                assigned.add(commit.hash)
                if (nextPushHash && commit.hash === nextPushHash) break
              }
            }

            if (groupCommits.length > 0) {
              pushGroups.push({
                id: pushEvent.hash.slice(0, 12),
                pushedAt: pushEvent.date,
                commits: groupCommits
              })
            }
          }

          // Any remaining unassigned commits go into an "older" group
          const remaining = pushedCommits.filter((c) => !assigned.has(c.hash))
          if (remaining.length > 0) {
            pushGroups.push({
              id: 'older',
              pushedAt: remaining[0].date,
              commits: remaining
            })
          }
        } else {
          fallbackMode = true
        }
      } catch {
        fallbackMode = true
      }

      // Fallback: group by day
      if (fallbackMode) {
        const dayMap = new Map<string, GitLogEntry[]>()
        for (const commit of pushedCommits) {
          const day = commit.date.split('T')[0]
          if (!dayMap.has(day)) dayMap.set(day, [])
          dayMap.get(day)!.push(commit)
        }
        pushGroups = Array.from(dayMap.entries()).map(([day, commits]) => ({
          id: day,
          pushedAt: commits[0].date,
          commits
        }))
      }

      const hasMore = log.length >= maxCount
      return { local, pushGroups, fallbackMode, branch, hasMore }
    } catch (err) {
      console.warn('[git] getJourney failed:', (err as Error).message)
      return { local: [], pushGroups: [], fallbackMode: false, branch: '', hasMore: false }
    }
  }

  async summarizePushGroup(
    _cwd: string,
    commitMessages: string[],
    diffStats: string
  ): Promise<{ title: string; description: string }> {
    const prompt = `Summarize this group of git commits that were pushed together.

Commit messages:
${commitMessages.map((m) => `- ${m}`).join('\n')}

Diff stats:
${diffStats}

Respond with exactly two lines:
Line 1: A short title (max 60 chars) describing what was accomplished
Line 2: A 1-2 sentence description explaining what changed and why

No quotes, no markdown, no extra formatting. Just two lines of plain text.`

    const env = { ...getLoginShellEnv() }
    delete env.CLAUDECODE

    return new Promise<{ title: string; description: string }>((resolve, reject) => {
      const child = execFile('claude', ['-p', '--model', 'haiku'], {
        env,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        timeout: 30000
      }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message))
          return
        }
        const lines = stdout.trim().split('\n').filter(Boolean)
        const title = lines[0] || 'Changes'
        const description = lines.slice(1).join(' ').trim() || ''
        resolve({ title, description })
      })
      child.stdin?.write(prompt)
      child.stdin?.end()
    })
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
