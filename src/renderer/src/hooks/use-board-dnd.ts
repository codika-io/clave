import { useCallback, useRef, useState } from 'react'
import { useBoardStore } from '../store/board-store'

interface DragState {
  taskId: string
  sourceColumnId: string
  startX: number
  startY: number
  started: boolean
}

interface DropTarget {
  columnId: string
  order: number
}

const DRAG_THRESHOLD = 5

export function useBoardDnd() {
  const moveTask = useBoardStore((s) => s.moveTask)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const ghostRef = useRef<HTMLElement | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)

  const createGhost = useCallback((sourceEl: HTMLElement, x: number, y: number) => {
    const ghost = sourceEl.cloneNode(true) as HTMLElement
    ghost.style.position = 'fixed'
    ghost.style.zIndex = '9999'
    ghost.style.width = `${sourceEl.offsetWidth}px`
    ghost.style.pointerEvents = 'none'
    ghost.style.opacity = '0.85'
    ghost.style.transform = 'rotate(2deg) scale(1.02)'
    ghost.style.left = `${x - sourceEl.offsetWidth / 2}px`
    ghost.style.top = `${y - 20}px`
    document.body.appendChild(ghost)
    return ghost
  }, [])

  const removeGhost = useCallback(() => {
    if (ghostRef.current) {
      ghostRef.current.remove()
      ghostRef.current = null
    }
  }, [])

  const findDropTarget = useCallback((x: number, y: number): DropTarget | null => {
    const columnEls = document.querySelectorAll<HTMLElement>('[data-column-id]')
    for (const colEl of columnEls) {
      const rect = colEl.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right) {
        const columnId = colEl.dataset.columnId!
        const cardEls = colEl.querySelectorAll<HTMLElement>('[data-task-id]')
        let order = 0
        for (const cardEl of cardEls) {
          const cardRect = cardEl.getBoundingClientRect()
          const cardMidY = cardRect.top + cardRect.height / 2
          if (y > cardMidY) {
            order++
          }
        }
        return { columnId, order }
      }
    }
    return null
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent, taskId: string, columnId: string) => {
      if (e.button !== 0) return
      e.preventDefault()

      dragRef.current = {
        taskId,
        sourceColumnId: columnId,
        startX: e.clientX,
        startY: e.clientY,
        started: false
      }

      const sourceEl = (e.target as HTMLElement).closest('[data-task-id]') as HTMLElement | null

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return

        const dx = ev.clientX - drag.startX
        const dy = ev.clientY - drag.startY

        if (!drag.started) {
          if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
          drag.started = true
          setDraggingTaskId(drag.taskId)
          if (sourceEl) {
            ghostRef.current = createGhost(sourceEl, ev.clientX, ev.clientY)
          }
        }

        if (ghostRef.current) {
          ghostRef.current.style.left = `${ev.clientX - (sourceEl?.offsetWidth ?? 200) / 2}px`
          ghostRef.current.style.top = `${ev.clientY - 20}px`
        }

        const target = findDropTarget(ev.clientX, ev.clientY)
        dropTargetRef.current = target
        setDropTarget(target)
      }

      const onUp = () => {
        const drag = dragRef.current
        const currentTarget = dropTargetRef.current
        if (drag?.started && currentTarget) {
          moveTask(drag.taskId, currentTarget.columnId, currentTarget.order)
        }

        dragRef.current = null
        dropTargetRef.current = null
        setDraggingTaskId(null)
        setDropTarget(null)
        removeGhost()
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [createGhost, removeGhost, findDropTarget, moveTask]
  )

  return {
    draggingTaskId,
    dropTarget,
    onPointerDown
  }
}
