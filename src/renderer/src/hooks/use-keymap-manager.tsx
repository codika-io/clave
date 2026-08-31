import { useEffect, useRef, useState } from 'react'
import {
  KEYMAP_ACTIONS,
  KEYMAP_SEQUENCE_TIMEOUT_MS,
  KeymapMatcher,
  formatKeyBinding,
  keyEventToChord,
  type KeymapActionId
} from '../../../shared/keymaps'
import { useKeymapStore } from '../store/keymap-store'

export type KeymapActionHandlers = Record<KeymapActionId, (event: KeyboardEvent) => void>

export interface CommandHud {
  text: string
  state: 'pending' | 'matched' | 'cancelled'
}

const ACTIONS_BY_ID = new Map(KEYMAP_ACTIONS.map((action) => [action.id, action]))

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('.xterm')) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function localKeyContext(target: EventTarget | null): boolean {
  if (document.querySelector('[role="dialog"], .modal-card, .menu-surface--sheet')) return true
  return (
    target instanceof HTMLElement && !!target.closest('[data-keymap-recorder], [data-keymap-local]')
  )
}

export function useKeymapManager(actions: KeymapActionHandlers): CommandHud | null {
  const config = useKeymapStore((state) => state.config)
  const matcherRef = useRef(new KeymapMatcher(config))
  const commandActiveRef = useRef(false)
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hud, setHud] = useState<CommandHud | null>(null)

  useEffect(() => {
    matcherRef.current.setConfig(config)
    commandActiveRef.current = false
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current)
    const clearHud = setTimeout(() => setHud(null), 0)
    return () => clearTimeout(clearHud)
  }, [config])

  useEffect(() => {
    const clearHideTimer = (): void => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    const showTemporary = (next: CommandHud): void => {
      clearHideTimer()
      setHud(next)
      hideTimerRef.current = setTimeout(() => setHud(null), 700)
    }
    const run = (actionId: KeymapActionId, event: KeyboardEvent | null): void => {
      const action = ACTIONS_BY_ID.get(actionId)
      if (action?.scope === 'app' && editableTarget(event?.target ?? null)) return
      if (event) actions[actionId](event)
      else actions[actionId](new KeyboardEvent('keydown'))
    }
    const scheduleExpiry = (event: KeyboardEvent): void => {
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current)
      deadlineTimerRef.current = setTimeout(() => {
        const result = matcherRef.current.expire(Date.now())
        commandActiveRef.current = false
        if (result.kind === 'matched') {
          run(result.actionId, event)
          showTemporary({
            text: ACTIONS_BY_ID.get(result.actionId)?.label ?? result.actionId,
            state: 'matched'
          })
        } else if (result.kind === 'cancelled') {
          showTemporary({
            text: `No command for ${formatKeyBinding(result.sequence, config.masterKey)}`,
            state: 'cancelled'
          })
        }
      }, KEYMAP_SEQUENCE_TIMEOUT_MS)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.isComposing || localKeyContext(event.target)) return
      const chord = keyEventToChord(event)
      if (!chord) return

      if (!commandActiveRef.current && config.masterKey === chord && editableTarget(event.target))
        return
      if (commandActiveRef.current && editableTarget(event.target)) {
        matcherRef.current.reset()
        commandActiveRef.current = false
        setHud(null)
        return
      }

      const wasCommand = commandActiveRef.current
      const result = matcherRef.current.handleChord(chord, Date.now())
      if (result.kind === 'none') return

      if (result.kind === 'matched') {
        const definition = ACTIONS_BY_ID.get(result.actionId)
        if (definition?.scope === 'app' && editableTarget(event.target)) return
      }

      event.preventDefault()
      event.stopPropagation()

      if (result.kind === 'pending') {
        commandActiveRef.current = true
        clearHideTimer()
        setHud({ text: formatKeyBinding(result.sequence, config.masterKey), state: 'pending' })
        scheduleExpiry(event)
        return
      }

      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current)
      commandActiveRef.current = false
      if (result.kind === 'matched') {
        run(result.actionId, event)
        if (wasCommand) {
          showTemporary({
            text: ACTIONS_BY_ID.get(result.actionId)?.label ?? result.actionId,
            state: 'matched'
          })
        } else {
          setHud(null)
        }
      } else {
        showTemporary({
          text: `No command for ${formatKeyBinding(result.sequence, config.masterKey)}`,
          state: 'cancelled'
        })
      }
    }

    const reset = (): void => {
      matcherRef.current.reset()
      commandActiveRef.current = false
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current)
      setHud(null)
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', reset)
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current)
      clearHideTimer()
    }
  }, [actions, config])

  return hud
}
