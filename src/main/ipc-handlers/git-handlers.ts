import { ipcMain } from 'electron'
import { gitManager } from '../git-manager'
import type { MagicSyncStep, MagicPullStep } from '../git-manager'

export function registerGitHandlers(): void {
  ipcMain.handle('git:check-ignored', (_event, cwd: string, paths: string[]) =>
    gitManager.checkIgnored(cwd, paths)
  )
  ipcMain.handle('git:fetch', (_event, cwd: string) => gitManager.fetch(cwd))
  ipcMain.handle('git:status', (_event, cwd: string) => gitManager.getStatus(cwd))
  ipcMain.handle('git:discover-repos', (_event, cwd: string) => gitManager.discoverRepos(cwd))
  ipcMain.handle('git:stage', (_event, cwd: string, files: string[]) => gitManager.stage(cwd, files))
  ipcMain.handle('git:unstage', (_event, cwd: string, files: string[]) =>
    gitManager.unstage(cwd, files)
  )
  ipcMain.handle('git:commit', (_event, cwd: string, message: string) =>
    gitManager.commit(cwd, message)
  )
  ipcMain.handle('git:push', (_event, cwd: string) => gitManager.push(cwd))
  ipcMain.handle('git:publish-branch', (_event, cwd: string) => gitManager.publishBranch(cwd))
  ipcMain.handle(
    'git:pull',
    (_event, cwd: string, strategy?: 'auto' | 'merge' | 'rebase' | 'ff-only') =>
      gitManager.pull(cwd, strategy)
  )
  ipcMain.handle(
    'git:discard',
    (_event, cwd: string, files: Array<{ path: string; status: string; staged: boolean }>) =>
      gitManager.discard(cwd, files)
  )
  ipcMain.handle(
    'git:diff',
    (_event, cwd: string, filePath: string, staged: boolean, isUntracked: boolean) =>
      gitManager.getDiff(cwd, filePath, staged, isUntracked)
  )
  ipcMain.handle('git:log', (_event, cwd: string, maxCount?: number) =>
    gitManager.getLog(cwd, maxCount)
  )
  ipcMain.handle('git:outgoing-commits', (_event, cwd: string) =>
    gitManager.getOutgoingCommits(cwd)
  )
  ipcMain.handle('git:incoming-commits', (_event, cwd: string) =>
    gitManager.getIncomingCommits(cwd)
  )
  ipcMain.handle('git:commit-files', (_event, cwd: string, hash: string) =>
    gitManager.getCommitFiles(cwd, hash)
  )
  ipcMain.handle('git:commit-diff', (_event, cwd: string, hash: string, filePath: string) =>
    gitManager.getCommitDiff(cwd, hash, filePath)
  )
  ipcMain.handle('git:generate-commit-message', (_event, cwd: string) =>
    gitManager.generateCommitMessage(cwd)
  )
  ipcMain.handle('git:magic-sync', (event, repoPaths: string[]) =>
    gitManager.magicSync(repoPaths, (repoPath: string, step: MagicSyncStep) => {
      event.sender.send('git:magic-sync-progress', repoPath, step)
    })
  )
  ipcMain.handle('git:magic-pull', (event, repoPaths: string[]) =>
    gitManager.magicPull(repoPaths, (repoPath: string, step: MagicPullStep) => {
      event.sender.send('git:magic-pull-progress', repoPath, step)
    })
  )
  ipcMain.handle('git:journey', (_event, cwd: string, maxCount?: number) =>
    gitManager.getJourney(cwd, maxCount)
  )
  ipcMain.handle(
    'git:summarize-push',
    (_event, cwd: string, commitMessages: string[], diffStats: string) =>
      gitManager.summarizePushGroup(cwd, commitMessages, diffStats)
  )
}
