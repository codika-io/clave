import { useEffect, useRef } from 'react'

/**
 * Calls back when a file on disk changes. Rides the main process's per-file
 * watcher (a directory watch that survives an editor's atomic rename), which
 * holds ONE watcher per path: a second consumer of the same path would
 * otherwise tear the first one's down on unmount, so the count is kept here
 * and the watcher is released by the last one out.
 */
const consumers = new Map<string, number>()

export function useFileChanged(absPath: string | null, onChange: () => void): void {
  const cb = useRef(onChange)
  useEffect(() => {
    cb.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!absPath) return
    consumers.set(absPath, (consumers.get(absPath) ?? 0) + 1)
    void window.electronAPI.watchClaveFile(absPath)
    const off = window.electronAPI.onClaveFileChanged((changed) => {
      if (changed === absPath) cb.current()
    })
    return () => {
      off()
      const left = (consumers.get(absPath) ?? 1) - 1
      if (left <= 0) {
        consumers.delete(absPath)
        void window.electronAPI.unwatchClaveFile(absPath)
      } else consumers.set(absPath, left)
    }
  }, [absPath])
}
