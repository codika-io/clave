import { useEffect } from 'react'
import { useBoardStore } from '../store/board-store'

export function useBoardPersistence(): void {
  const loadBoard = useBoardStore((s) => s.loadBoard)
  const loaded = useBoardStore((s) => s.loaded)

  useEffect(() => {
    if (!loaded) {
      loadBoard()
    }
  }, [loaded, loadBoard])
}
