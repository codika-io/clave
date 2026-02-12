export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function shortenPath(fullPath: string, maxLength = 40): string {
  if (fullPath.length <= maxLength) return fullPath
  const parts = fullPath.split('/')
  if (parts.length <= 2) return fullPath
  return '~/' + parts.slice(-2).join('/')
}
