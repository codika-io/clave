// src/main/inventory/content-cache.ts
import * as fs from 'fs/promises'

interface CacheEntry {
  mtimeMs: number
  size: number
  content: string
}

class ContentCache {
  private cache = new Map<string, CacheEntry>()

  async readIfChanged(filePath: string): Promise<string | null> {
    try {
      const stat = await fs.stat(filePath)
      const prev = this.cache.get(filePath)
      if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
        return prev.content
      }
      const content = await fs.readFile(filePath, 'utf-8')
      this.cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, content })
      return content
    } catch {
      this.cache.delete(filePath)
      return null
    }
  }

  invalidate(filePath?: string): void {
    if (filePath) this.cache.delete(filePath)
    else this.cache.clear()
  }
}

export const contentCache = new ContentCache()
