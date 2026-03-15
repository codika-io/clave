import type { GitFileStatus } from '../../../../preload/index.d'

export type PullStrategy = 'auto' | 'merge' | 'rebase' | 'ff-only'

export function statusLetter(status: GitFileStatus['status']): string {
  switch (status) {
    case 'staged':
      return 'A'
    case 'modified':
      return 'M'
    case 'deleted':
      return 'D'
    case 'untracked':
      return '?'
    case 'staged-modified':
      return 'M'
    case 'staged-deleted':
      return 'D'
    case 'renamed':
      return 'R'
  }
}

export function statusColor(status: GitFileStatus['status']): string {
  switch (status) {
    case 'staged':
    case 'renamed':
      return 'text-green-400'
    case 'modified':
    case 'staged-modified':
      return 'text-orange-400'
    case 'deleted':
    case 'staged-deleted':
      return 'text-red-400'
    case 'untracked':
      return 'text-text-tertiary'
  }
}

export function splitPath(filePath: string): { name: string; dir: string } {
  const lastSlash = filePath.lastIndexOf('/')
  if (lastSlash === -1) return { name: filePath, dir: '' }
  return { name: filePath.slice(lastSlash + 1), dir: filePath.slice(0, lastSlash + 1) }
}
