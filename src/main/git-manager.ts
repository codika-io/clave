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

  async pull(cwd: string): Promise<void> {
    const git = simpleGit(cwd)
    await git.pull()
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
