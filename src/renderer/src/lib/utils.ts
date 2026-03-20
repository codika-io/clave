import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function fileUrl(absolutePath: string): string {
  return 'file://' + absolutePath.split('/').map(encodeURIComponent).join('/')
}

export function shortenPath(fullPath: string, maxLength = 40): string {
  if (fullPath.length <= maxLength) return fullPath
  const parts = fullPath.split('/')
  if (parts.length <= 2) return fullPath
  return '~/' + parts.slice(-2).join('/')
}
