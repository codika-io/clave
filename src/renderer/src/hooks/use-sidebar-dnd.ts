import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../store/session-store'

export interface DropIndicatorState {
  targetId: string
  position: 'before' | 'after' | 'inside'
}

interface DndRenderState {
  isDragging: boolean
  draggedIds: string[]
  dropIndicator: DropIndicatorState | null
}

interface DragRef {
  ids: string[]
  isGroup: boolean
  startX: number
  startY: number
  started: boolean
  sourceEl: HTMLElement | null
  currentIndicator: DropIndicatorState | null
  scrollAnimFrame: number | null
  overlayWidth: number
}

const DRAG_THRESHOLD = 5
const AUTO_SCROLL_ZONE = 40
const AUTO_SCROLL_SPEED = 10
const GAP_HEIGHT = 36
const SETTLE_DURATION = 150 // ms for drop settle animation
const INDICATOR_DEBOUNCE = 32 // ms — absorbs layout-induced oscillation

export { GAP_HEIGHT }

export function useSidebarDnd(opts: {
  containerRef: React.RefObject<HTMLElement | null>
  moveItems: (ids: string[], targetId: string, position: 'before' | 'after' | 'inside') => void
}) {
  const { containerRef, moveItems } = opts

  const [dndState, setDndState] = useState<DndRenderState>({
    isDragging: false,
    draggedIds: [],
    dropIndicator: null
  })

  const dragRef = useRef<DragRef | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const indicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Create/destroy overlay element
  const createOverlay = useCallback((sourceEl: HTMLElement) => {
    const overlay = document.createElement('div')
    overlay.className = 'sidebar-drag-overlay'

    // Clone the button content from the source
    const button = sourceEl.querySelector('button')
    if (button) {
      const clone = button.cloneNode(true) as HTMLElement
      // Strip event listeners by re-creating as innerHTML
      overlay.innerHTML = ''
      overlay.appendChild(clone)
      clone.style.pointerEvents = 'none'
      clone.style.opacity = '1'
      // Match the source width
      overlay.style.width = `${button.getBoundingClientRect().width}px`
    }

    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '99999',
      pointerEvents: 'none',
      opacity: '0.9',
      transform: 'scale(1.02)',
      borderRadius: '8px',
      background: 'var(--color-surface-100)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)',
      transition: 'opacity 150ms, transform 150ms',
      willChange: 'left, top'
    })

    document.body.appendChild(overlay)
    overlayRef.current = overlay
  }, [])

  const destroyOverlay = useCallback(() => {
    if (overlayRef.current) {
      overlayRef.current.remove()
      overlayRef.current = null
    }
  }, [])

  // Hit-test: find the sidebar item under the cursor and determine drop position
  const hitTest = useCallback(
    (clientX: number, clientY: number, drag: DragRef) => {
      const container = containerRef.current
      if (!container) return

      // Find all sidebar items using data attributes
      const items = container.querySelectorAll<HTMLElement>('[data-sidebar-item-id]')
      if (items.length === 0) return

      // Compensate for the active gap pushing items down.
      // Without this, the gap shifts bounding rects, which changes the hit-test
      // result, which moves the gap, causing oscillation/flicker.
      let gapOffset = 0
      let gapTop = Infinity
      const gapEl = container.querySelector<HTMLElement>('.sidebar-drop-gap-active')
      if (gapEl) {
        const gapRect = gapEl.getBoundingClientRect()
        gapOffset = gapRect.height
        gapTop = gapRect.top
      }

      let newIndicator: DropIndicatorState | null = null

      // Check each item
      for (const itemEl of items) {
        const rawRect = itemEl.getBoundingClientRect()

        // Adjust rect: items below the gap are shifted down by gapOffset,
        // so subtract it to get their "gap-less" position.
        const rect = rawRect.top >= gapTop
          ? { left: rawRect.left, right: rawRect.right, top: rawRect.top - gapOffset, bottom: rawRect.bottom - gapOffset, height: rawRect.height }
          : { left: rawRect.left, right: rawRect.right, top: rawRect.top, bottom: rawRect.bottom, height: rawRect.height }

        // Also adjust cursor Y for comparison: if cursor is below the gap, compensate
        const adjustedY = clientY >= gapTop + gapOffset ? clientY - gapOffset : clientY

        // Skip if cursor is not within horizontal bounds
        if (clientX < rect.left || clientX > rect.right) continue
        // Skip if cursor is not within vertical bounds (with some tolerance)
        if (adjustedY < rect.top - 2 || adjustedY > rect.bottom + 2) continue

        const itemId = itemEl.dataset.sidebarItemId!
        const isGroup = itemEl.dataset.sidebarItemType === 'group'

        // Don't allow dropping on self
        if (drag.ids.includes(itemId)) continue

        const y = adjustedY - rect.top
        const height = rect.height

        let position: 'before' | 'after' | 'inside'
        let targetId = itemId

        if (isGroup) {
          const state = useSessionStore.getState()
          const group = state.groups.find((g) => g.id === targetId)
          const isExpanded = group && !group.collapsed

          if (isExpanded) {
            // Expanded group: generous top edge for "before", rest = "inside"
            if (y < height * 0.35) position = 'before'
            else position = 'inside'
          } else {
            // Collapsed group: wider before/after edges, narrower inside target
            if (y < height * 0.3) position = 'before'
            else if (y > height * 0.7) position = 'after'
            else position = 'inside'
          }

          // Don't allow dropping a group inside another group
          if (
            position === 'inside' &&
            drag.ids.some((id) => useSessionStore.getState().groups.some((g) => g.id === id))
          ) {
            position = y < height / 2 ? 'before' : 'after'
          }
        } else {
          position = y < height / 2 ? 'before' : 'after'

          const state = useSessionStore.getState()
          const parentGroup = state.groups.find((g) => g.sessionIds.includes(targetId))
          if (parentGroup) {
            const isFirst = parentGroup.sessionIds[0] === targetId
            const isLast =
              parentGroup.sessionIds[parentGroup.sessionIds.length - 1] === targetId

            const isDraggingGroup = drag.ids.some((id) =>
              state.groups.some((g) => g.id === id)
            )
            const isDraggingWithinGroup = drag.ids.every((id) =>
              parentGroup.sessionIds.includes(id)
            )

            if (!isDraggingGroup && !isDraggingWithinGroup) {
              if (isFirst && isLast) {
                // Single-child group: larger escape zone (bottom 35%)
                if (y <= height * 0.65) {
                  targetId = parentGroup.id
                  position = 'inside'
                } else {
                  targetId = parentGroup.id
                  position = 'after'
                }
              } else if (isFirst) {
                // First child: top half → group inside
                if (y < height * 0.5) {
                  targetId = parentGroup.id
                  position = 'inside'
                }
              } else if (isLast) {
                // Last child: larger escape zone (bottom 35%)
                if (y > height * 0.4 && y <= height * 0.65) {
                  targetId = parentGroup.id
                  position = 'inside'
                } else if (y > height * 0.65) {
                  targetId = parentGroup.id
                  position = 'after'
                }
              }
            } else {
              // Reordering within group or dragging a group: escape zone only
              if (isLast && y > height * 0.65) {
                targetId = parentGroup.id
                position = 'after'
              }
            }
          }
        }

        newIndicator = { targetId, position }
        break
      }

      // If no item hit, check container edges and gaps between items.
      // Use gap-compensated positions for consistency with the main hit-test.
      if (!newIndicator && items.length > 0) {
        const containerRect = container.getBoundingClientRect()
        if (clientX >= containerRect.left && clientX <= containerRect.right) {
          // Compensated first/last rects
          const firstRawRect = items[0].getBoundingClientRect()
          const firstTop = firstRawRect.top >= gapTop ? firstRawRect.top - gapOffset : firstRawRect.top
          const lastItem = items[items.length - 1]
          const lastRawRect = lastItem.getBoundingClientRect()
          const lastBottom = lastRawRect.top >= gapTop ? lastRawRect.bottom - gapOffset : lastRawRect.bottom
          const adjustedY = clientY >= gapTop + gapOffset ? clientY - gapOffset : clientY

          // Helper: if the resolved item is inside a group, redirect "after" to the
          // group level so the drop lands outside the group, not appended inside it.
          const resolveAfter = (itemId: string): DropIndicatorState | null => {
            if (drag.ids.includes(itemId)) return null
            const state = useSessionStore.getState()
            const parentGroup = state.groups.find((g) => g.sessionIds.includes(itemId))
            if (parentGroup) {
              return { targetId: parentGroup.id, position: 'after' }
            }
            return { targetId: itemId, position: 'after' }
          }

          if (adjustedY < firstTop) {
            const firstId = items[0].dataset.sidebarItemId!
            if (!drag.ids.includes(firstId)) {
              newIndicator = { targetId: firstId, position: 'before' }
            }
          } else if (adjustedY > lastBottom) {
            const lastId = lastItem.dataset.sidebarItemId!
            newIndicator = resolveAfter(lastId)
          } else {
            // Check gaps between items — find closest item above cursor (compensated)
            let closestAbove: HTMLElement | null = null
            let closestAboveBottom = -Infinity
            for (const itemEl of items) {
              const rawRect = itemEl.getBoundingClientRect()
              const bottom = rawRect.top >= gapTop ? rawRect.bottom - gapOffset : rawRect.bottom
              if (bottom <= adjustedY && bottom > closestAboveBottom) {
                closestAbove = itemEl
                closestAboveBottom = bottom
              }
            }
            if (closestAbove) {
              const id = closestAbove.dataset.sidebarItemId!
              newIndicator = resolveAfter(id)
            }
          }
        }
      }

      // Update indicator only if changed, with debounce to prevent layout-induced flicker.
      // The ref updates immediately (so drop always uses the latest), but the React
      // state update (which triggers gap rendering) is debounced.
      const changed =
        !drag.currentIndicator && !newIndicator
          ? false
          : !drag.currentIndicator ||
            !newIndicator ||
            drag.currentIndicator.targetId !== newIndicator.targetId ||
            drag.currentIndicator.position !== newIndicator.position

      if (changed) {
        drag.currentIndicator = newIndicator

        // Clear any pending debounced update
        if (indicatorTimerRef.current) {
          clearTimeout(indicatorTimerRef.current)
        }
        indicatorTimerRef.current = setTimeout(() => {
          indicatorTimerRef.current = null
          setDndState((prev) => ({ ...prev, dropIndicator: newIndicator }))
        }, INDICATOR_DEBOUNCE)
      }
    },
    [containerRef]
  )

  // Auto-scroll when near container edges
  const autoScroll = useCallback(
    (clientY: number, drag: DragRef) => {
      const container = containerRef.current
      if (!container) return

      if (drag.scrollAnimFrame) {
        cancelAnimationFrame(drag.scrollAnimFrame)
        drag.scrollAnimFrame = null
      }

      const rect = container.getBoundingClientRect()
      const topDist = clientY - rect.top
      const bottomDist = rect.bottom - clientY

      let scrollDelta = 0
      if (topDist < AUTO_SCROLL_ZONE && topDist > 0) {
        scrollDelta = -AUTO_SCROLL_SPEED * (1 - topDist / AUTO_SCROLL_ZONE)
      } else if (bottomDist < AUTO_SCROLL_ZONE && bottomDist > 0) {
        scrollDelta = AUTO_SCROLL_SPEED * (1 - bottomDist / AUTO_SCROLL_ZONE)
      }

      if (scrollDelta !== 0) {
        const scroll = () => {
          container.scrollTop += scrollDelta
          drag.scrollAnimFrame = requestAnimationFrame(scroll)
        }
        drag.scrollAnimFrame = requestAnimationFrame(scroll)
      }
    },
    [containerRef]
  )

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, itemId: string, isGroup: boolean) => {
      // Only left button, not during editing
      if (e.button !== 0) return
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      const state = useSessionStore.getState()
      let ids: string[]
      if (isGroup) {
        ids = [itemId]
      } else if (state.selectedSessionIds.includes(itemId)) {
        ids = state.selectedSessionIds.filter(
          (sid) => !state.groups.some((g) => g.id === sid)
        )
      } else {
        ids = [itemId]
      }

      dragRef.current = {
        ids,
        isGroup,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        sourceEl: e.currentTarget as HTMLElement,
        currentIndicator: null,
        scrollAnimFrame: null,
        overlayWidth: 0
      }
    },
    []
  )

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return

      if (!drag.started) {
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return

        // Start dragging
        drag.started = true
        if (drag.sourceEl) {
          createOverlay(drag.sourceEl)
          drag.overlayWidth = overlayRef.current?.getBoundingClientRect().width ?? 0
        }
        setDndState({
          isDragging: true,
          draggedIds: drag.ids,
          dropIndicator: null
        })

        // Prevent the click event that would fire on pointer up
        const preventClick = (evt: Event) => {
          evt.stopPropagation()
          evt.preventDefault()
        }
        document.addEventListener('click', preventClick, { capture: true, once: true })
        // Safety: remove if not fired within 500ms (click fires async after pointerup)
        setTimeout(() => document.removeEventListener('click', preventClick, { capture: true }), 500)
      }

      // Update overlay position (uses cached width to avoid layout thrashing)
      if (overlayRef.current) {
        overlayRef.current.style.left = `${e.clientX - drag.overlayWidth / 2}px`
        overlayRef.current.style.top = `${e.clientY - 20}px`
      }

      // Hit test
      hitTest(e.clientX, e.clientY, drag)

      // Auto-scroll
      autoScroll(e.clientY, drag)
    }

    const handlePointerUp = () => {
      const drag = dragRef.current
      if (!drag) return

      if (drag.scrollAnimFrame) {
        cancelAnimationFrame(drag.scrollAnimFrame)
      }

      // Flush any pending debounced indicator so the gap is rendered for settle animation
      if (indicatorTimerRef.current) {
        clearTimeout(indicatorTimerRef.current)
        indicatorTimerRef.current = null
        if (drag.currentIndicator) {
          setDndState((prev) => ({ ...prev, dropIndicator: drag.currentIndicator }))
        }
      }

      if (drag.started && drag.currentIndicator) {
        const indicator = drag.currentIndicator
        const overlay = overlayRef.current

        // Find the gap element to animate toward
        const container = containerRef.current
        const gapEl = container?.querySelector<HTMLElement>('.sidebar-drop-gap-active')
        const gapRect = gapEl?.getBoundingClientRect()

        if (overlay && gapRect && gapRect.height > 0) {
          // Animate overlay settling into the gap position
          Object.assign(overlay.style, {
            transition: `left ${SETTLE_DURATION}ms ease-out, top ${SETTLE_DURATION}ms ease-out, transform ${SETTLE_DURATION}ms ease-out, opacity ${SETTLE_DURATION}ms ease-out`,
            left: `${gapRect.left}px`,
            top: `${gapRect.top}px`,
            transform: 'scale(1)',
            opacity: '0.6'
          })

          // Commit after animation completes
          dragRef.current = null
          setTimeout(() => {
            moveItems(drag.ids, indicator.targetId, indicator.position)
            destroyOverlay()
            setDndState({
              isDragging: false,
              draggedIds: [],
              dropIndicator: null
            })
          }, SETTLE_DURATION)
        } else {
          // No gap visible (e.g. "inside" drop) — commit immediately
          dragRef.current = null
          moveItems(drag.ids, indicator.targetId, indicator.position)
          destroyOverlay()
          setDndState({
            isDragging: false,
            draggedIds: [],
            dropIndicator: null
          })
        }
      } else {
        // Drag didn't start or no valid target — just clean up
        dragRef.current = null
        destroyOverlay()
        setDndState({
          isDragging: false,
          draggedIds: [],
          dropIndicator: null
        })
      }
    }

    // ESC to cancel drag
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current?.started) {
        e.preventDefault()
        if (dragRef.current.scrollAnimFrame) {
          cancelAnimationFrame(dragRef.current.scrollAnimFrame)
        }
        if (indicatorTimerRef.current) {
          clearTimeout(indicatorTimerRef.current)
          indicatorTimerRef.current = null
        }
        dragRef.current = null
        destroyOverlay()
        setDndState({
          isDragging: false,
          draggedIds: [],
          dropIndicator: null
        })
      }
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [createOverlay, destroyOverlay, hitTest, autoScroll, moveItems, containerRef])

  return {
    isDragging: dndState.isDragging,
    draggedIds: dndState.draggedIds,
    dropIndicator: dndState.dropIndicator,
    handlePointerDown
  }
}
