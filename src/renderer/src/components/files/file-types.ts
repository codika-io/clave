export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'])
export const MARKDOWN_EXTS = new Set(['md', 'mdx'])
export const EXTERNAL_EXTS = new Set([
  'html',
  'htm',
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp'
])

export function extOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTS.has(extOf(filename))
}

export function isMarkdownFile(filename: string): boolean {
  return MARKDOWN_EXTS.has(extOf(filename))
}

export function canOpenExternally(filename: string): boolean {
  return EXTERNAL_EXTS.has(extOf(filename))
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}
