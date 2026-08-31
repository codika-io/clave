import { describe, expect, it } from 'vitest'
import {
  KEYMAP_ACTIONS,
  KEYMAP_SEQUENCE_TIMEOUT_MS,
  KeymapMatcher,
  canonicalizeBinding,
  formatKeyBinding,
  keyEventToChord,
  overridesFromResolved,
  parseKeymapOverrides,
  resolveKeymapConfig
} from './keymaps'

describe('keymap defaults', () => {
  it('keeps every existing Clave app shortcut and adds the command prefix', () => {
    const config = resolveKeymapConfig()

    expect(config.masterKey).toBe('Mod+K')
    expect(config.bindings.newTerminal).toContain('Mod+T')
    expect(config.bindings.newClaude).toEqual(['Mod+N', 'Master C'])
    expect(config.bindings.newDangerousClaude).toContain('Mod+D')
    expect(config.bindings.newClaudeAgents).toContain('Mod+Shift+A')
    expect(config.bindings.newAntigravity).toContain('Mod+I')
    expect(config.bindings.newCodex).toContain('Mod+U')
    expect(config.bindings.resetSessions).toEqual(['Mod+Shift+Backspace'])
    expect(config.bindings.killFocusedSession).toEqual(['Mod+Backspace'])
    expect(config.bindings.newPi).toContain('Mod+Shift+P')
    expect(config.bindings.newClaudeAtFolder).toEqual(['Mod+Alt+N'])
    expect(config.bindings.newPiAtFolder).toEqual(['Mod+Alt+Shift+P'])
    expect(KEYMAP_ACTIONS).toHaveLength(42)
  })

  it('keeps the master key off the chords a terminal owns', () => {
    // Clave's keydown listener captures before xterm.js sees the event, so a
    // Ctrl chord as master key eats tmux's own prefix and readline's editing
    // keys inside every session. On macOS only Command chords are the app's.
    const master = resolveKeymapConfig().masterKey
    expect(master).not.toBeNull()
    expect(master!.startsWith('Mod+')).toBe(true)
    expect(master).not.toMatch(/(^|\+)Ctrl\+/)
  })
})

describe('keymap syntax', () => {
  it('canonicalizes capital letters without implying Shift', () => {
    expect(canonicalizeBinding('ctrl+b')).toBe('Ctrl+B')
    expect(canonicalizeBinding('ctrl+shift+b')).toBe('Ctrl+Shift+B')
    expect(canonicalizeBinding(' master   c  n ')).toBe('Master C N')
    expect(() => canonicalizeBinding('Master C Master')).toThrow(
      'Master can only be the first sequence step'
    )
  })

  it('normalizes a macOS keyboard event with exact modifiers', () => {
    expect(
      keyEventToChord({ key: 'b', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false })
    ).toBe('Ctrl+B')
    expect(
      keyEventToChord({ key: 'B', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true })
    ).toBe('Ctrl+Shift+B')
    expect(
      keyEventToChord({ key: '?', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true })
    ).toBe('Mod+Shift+/')
  })

  it('reads an Option chord off the physical key macOS rewrote', () => {
    // ⌥ rewrites event.key on macOS — sometimes to a dead key, more often to the
    // composed glyph — so ⌥⌘T arrives as '†' and ⌥⌘N as 'Dead'. Both must land on
    // the binding the user configured, which is what event.code carries.
    expect(
      keyEventToChord({
        key: '†',
        code: 'KeyT',
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toBe('Mod+Alt+T')
    expect(
      keyEventToChord({
        key: 'Dead',
        code: 'KeyN',
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toBe('Mod+Alt+N')
    expect(
      keyEventToChord({
        key: '©',
        code: 'KeyG',
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toBe('Mod+Alt+G')
    expect(
      keyEventToChord({
        key: 'Å',
        code: 'KeyA',
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: true
      })
    ).toBe('Mod+Alt+Shift+A')
    // Without Option, event.key still wins: it is what respects the layout.
    expect(
      keyEventToChord({
        key: '{',
        code: 'BracketLeft',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: true
      })
    ).toBe('Mod+Shift+[')
  })

  it('formats Mod and Master for the current macOS UI', () => {
    expect(formatKeyBinding('Mod+Shift+A', 'Mod+K')).toBe('⌘⇧A')
    expect(formatKeyBinding('Master C', 'Mod+K')).toBe('⌘K C')
    expect(formatKeyBinding('Master C', 'Ctrl+B')).toBe('⌃B C')
  })
})

describe('keymap validation', () => {
  it('accepts versioned overrides, unbound actions, and two bindings', () => {
    const parsed = parseKeymapOverrides({
      version: 1,
      masterKey: null,
      bindings: { newClaude: [], newTerminal: ['Mod+T', 'Master T'] }
    })

    expect(parsed).toEqual({
      ok: true,
      value: {
        version: 1,
        masterKey: null,
        bindings: { newClaude: [], newTerminal: ['Mod+T', 'Master T'] }
      }
    })
  })

  it('reports unknown actions, excess bindings, malformed sequences, and conflicts together', () => {
    const parsed = parseKeymapOverrides({
      version: 1,
      bindings: {
        unknownAction: ['Mod+Q'],
        newClaude: ['Mod+N', 'Master C', 'Master N'],
        newTerminal: ['Ctrl+B C'],
        newCodex: ['Mod+N']
      }
    })

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Unknown action'),
        expect.stringContaining('at most 2'),
        expect.stringContaining('must start with Master'),
        expect.stringContaining('already assigned')
      ])
    )
  })

  it('stores only differences from the code defaults', () => {
    const config = resolveKeymapConfig({
      version: 1,
      masterKey: 'Ctrl+K',
      bindings: { newClaude: ['Mod+J'] }
    })

    expect(overridesFromResolved(config)).toEqual({
      version: 1,
      masterKey: 'Ctrl+K',
      bindings: { newClaude: ['Mod+J'] }
    })
  })
})

describe('command mode matching', () => {
  it('matches direct chords immediately and requires exact modifiers', () => {
    const matcher = new KeymapMatcher(resolveKeymapConfig())

    expect(matcher.handleChord('Mod+N', 0)).toEqual({ kind: 'matched', actionId: 'newClaude' })
    expect(matcher.handleChord('Mod+Ctrl+N', 1)).toEqual({ kind: 'none' })
  })

  it('enters through Master, consumes an unmatched key, and exits', () => {
    const master = resolveKeymapConfig().masterKey!
    const matcher = new KeymapMatcher(resolveKeymapConfig())

    expect(matcher.handleChord(master, 0)).toEqual({ kind: 'pending', sequence: master })
    expect(matcher.handleChord('X', 20)).toEqual({ kind: 'cancelled', sequence: `${master} X` })
    expect(matcher.handleChord('C', 30)).toEqual({ kind: 'none' })
  })

  it('matches command sequences and exits after the 300ms inter-key deadline', () => {
    const config = resolveKeymapConfig({
      version: 1,
      bindings: {
        newClaude: ['Master C'],
        newTerminal: ['Master C N']
      }
    })
    const master = config.masterKey!
    const matcher = new KeymapMatcher(config)

    expect(matcher.handleChord(master, 0).kind).toBe('pending')
    expect(matcher.handleChord('C', 10)).toEqual({ kind: 'pending', sequence: `${master} C` })
    expect(matcher.expire(10 + KEYMAP_SEQUENCE_TIMEOUT_MS - 1).kind).toBe('pending')
    expect(matcher.expire(10 + KEYMAP_SEQUENCE_TIMEOUT_MS)).toEqual({
      kind: 'matched',
      actionId: 'newClaude'
    })

    expect(matcher.handleChord(master, 400).kind).toBe('pending')
    expect(matcher.handleChord('C', 410).kind).toBe('pending')
    expect(matcher.handleChord('N', 420)).toEqual({ kind: 'matched', actionId: 'newTerminal' })
  })

  it('disables command mode when masterKey is unset but keeps direct bindings', () => {
    const master = resolveKeymapConfig().masterKey!
    const matcher = new KeymapMatcher(resolveKeymapConfig({ version: 1, masterKey: null }))

    expect(matcher.handleChord(master, 0)).toEqual({ kind: 'none' })
    expect(matcher.handleChord('Mod+N', 1)).toEqual({ kind: 'matched', actionId: 'newClaude' })
  })
})
