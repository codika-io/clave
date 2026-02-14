import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSessionStore, type Theme } from '../store/session-store'
import '@xterm/xterm/css/xterm.css'

// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]/g

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '')
}

function detectPrompt(buffer: string): string | null {
  // Collapse whitespace for matching (ANSI stripping removes cursor positioning,
  // leaving words glued together or with inconsistent spacing)
  const tail = buffer.slice(-500)
  // Claude Code permission/action prompt: keyboard hints at the bottom
  // After ANSI strip these appear as "Esctocancel", "Tabtoamend", etc.
  if (/Esc.*cancel/i.test(tail)) return 'is asking for permission'
  // Legacy/alternative: "Allow" and "Deny" buttons
  if (/Allow/i.test(tail) && /Deny/i.test(tail)) return 'is asking for permission'
  // Explicit yes/no confirmation
  if (/\(Y\/n\)|\[Y\/n\]|\(y\/N\)|\[y\/N\]/i.test(tail)) return 'is asking a question'
  // "Do you want to proceed?" style prompts (line ending with ?)
  // Exclude Claude's "? for shortcuts" hint line and single-char artifact lines
  const lines = tail.split(/\r?\n/).filter((l) => {
    const trimmed = l.trim()
    return (
      trimmed.length > 3 &&
      !/^\?\s*(for\s+)?shortcuts/i.test(trimmed) &&
      !/^[?]$/.test(trimmed)
    )
  })
  if (lines.length > 0 && lines[lines.length - 1].trimEnd().endsWith('?')) return 'is asking a question'
  return null
}

const DARK_THEME = {
  background: '#0a0a0a',
  foreground: 'rgba(255, 255, 255, 0.9)',
  cursor: 'rgba(255, 255, 255, 0.8)',
  cursorAccent: '#0a0a0a',
  selectionBackground: 'rgba(255, 255, 255, 0.15)',
  selectionForeground: undefined,
  black: '#1a1a1a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e5e5e5',
  brightBlack: '#404040',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93bbfd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff'
}

const LIGHT_THEME = {
  background: '#f9f9f9',
  foreground: 'rgba(0, 0, 0, 0.85)',
  cursor: 'rgba(0, 0, 0, 0.7)',
  cursorAccent: '#f9f9f9',
  selectionBackground: 'rgba(0, 0, 0, 0.12)',
  selectionForeground: undefined,
  black: '#000000',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#d4d4d4',
  brightBlack: '#737373',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#525252'
}

function getXtermTheme(theme: Theme) {
  return theme === 'dark' ? DARK_THEME : LIGHT_THEME
}

export function useTerminal(sessionId: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const theme = useSessionStore((s) => s.theme)

  const fit = useCallback(() => {
    fitAddonRef.current?.fit()
  }, [])

  // Create terminal on mount
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal({
      theme: getXtermTheme(useSessionStore.getState().theme),
      fontFamily: '"SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      scrollback: 10000,
      convertEol: true,
      linkHandler: {
        activate: (_event, text) => {
          window.electronAPI.openExternal(text)
        }
      }
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(container)

    if (container.offsetWidth > 0 && container.offsetHeight > 0) {
      fitAddon.fit()
    }
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Wire terminal input -> PTY
    const inputDisposable = terminal.onData((data) => {
      window.electronAPI.writeSession(sessionId, data)
    })

    // Wire terminal resize -> PTY
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      window.electronAPI.resizeSession(sessionId, cols, rows)
    })

    // Activity tracking: debounce from active → idle after 2s of silence
    let activityTimer: ReturnType<typeof setTimeout> | null = null
    let notificationTimer: ReturnType<typeof setTimeout> | null = null
    let outputBuffer = ''
    const { setSessionActivity, updateSessionAlive } = useSessionStore.getState()

    // Wire PTY output -> terminal
    const cleanupData = window.electronAPI.onSessionData(sessionId, (data) => {
      terminal.write(data)
      setSessionActivity(sessionId, 'active')

      // Append stripped data to rolling buffer (max 500 chars)
      outputBuffer = (outputBuffer + stripAnsi(data)).slice(-500)

      if (activityTimer) clearTimeout(activityTimer)
      if (notificationTimer) {
        clearTimeout(notificationTimer)
        notificationTimer = null
      }

      activityTimer = setTimeout(() => {
        setSessionActivity(sessionId, 'idle')

        // Check for prompt patterns after idle detection
        const promptType = detectPrompt(outputBuffer)
        console.log('[notification] Idle detected, prompt check:', promptType, '| buffer tail:', outputBuffer.slice(-100))
        if (promptType) {
          notificationTimer = setTimeout(() => {
            const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
            const title = session?.name ?? session?.folderName ?? 'Clave'
            window.electronAPI.showNotification?.({
              title,
              body: `Claude ${promptType}`,
              sessionId
            })
          }, 3000)
        }
      }, 2000)
    })

    // Handle PTY exit
    const cleanupExit = window.electronAPI.onSessionExit(sessionId, () => {
      terminal.write('\r\n\x1b[90m[Session ended]\x1b[0m\r\n')
      if (activityTimer) clearTimeout(activityTimer)
      activityTimer = null
      if (notificationTimer) {
        clearTimeout(notificationTimer)
        notificationTimer = null
      }
      updateSessionAlive(sessionId, false)

      const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
      const title = session?.name ?? session?.folderName ?? 'Clave'
      window.electronAPI.showNotification?.({
        title,
        body: 'Session has ended',
        sessionId
      })
    })

    // ResizeObserver for auto-fitting
    // Double-fit: the first fit runs immediately in rAF, the second runs after
    // a short delay to catch CSS grid reflows that settle over multiple frames.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width === 0 || height === 0) return
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          // ignore fit errors during layout transitions
        }
      })
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit()
        } catch {
          // ignore
        }
      }, 100)
    })
    resizeObserver.observe(container)

    // Initial resize sync
    window.electronAPI.resizeSession(sessionId, terminal.cols, terminal.rows)

    // Drag-and-drop file path insertion
    // Use capture phase so we intercept before xterm's internal elements
    const handleDragOver = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
    }

    const handleDrop = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      if (!e.dataTransfer) return

      let paths: string[] = []

      // 1. Files from native file manager (Finder, etc.)
      if (e.dataTransfer.files.length > 0) {
        paths = Array.from(e.dataTransfer.files)
          .map((f) => window.electronAPI.getPathForFile(f))
          .filter(Boolean)
      }

      // 2. text/uri-list (VS Code, other apps)
      if (paths.length === 0) {
        const uriList = e.dataTransfer.getData('text/uri-list')
        if (uriList) {
          paths = uriList
            .split(/\r?\n/)
            .filter((line) => line.trim() && !line.startsWith('#'))
            .map((uri) => {
              try {
                const url = new URL(uri.trim())
                if (url.protocol === 'file:') {
                  return decodeURIComponent(url.pathname)
                }
              } catch {
                // not a valid URL
              }
              return ''
            })
            .filter(Boolean)
        }
      }

      // 3. text/plain fallback (file paths as plain text)
      if (paths.length === 0) {
        const text = e.dataTransfer.getData('text/plain')
        if (text) {
          paths = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.startsWith('/') || l.startsWith('~'))
        }
      }

      // Shell-escape and write to PTY
      const escaped = paths
        .filter(Boolean)
        .map((p) => `'${p.replace(/'/g, "'\\''")}'`)

      if (escaped.length > 0) {
        window.electronAPI.writeSession(sessionId, escaped.join(' '))
        terminal.focus()
      }
    }

    container.addEventListener('dragover', handleDragOver, true)
    container.addEventListener('drop', handleDrop, true)

    return () => {
      container.removeEventListener('dragover', handleDragOver, true)
      container.removeEventListener('drop', handleDrop, true)
      if (resizeTimer) clearTimeout(resizeTimer)
      if (activityTimer) clearTimeout(activityTimer)
      if (notificationTimer) clearTimeout(notificationTimer)
      inputDisposable.dispose()
      resizeDisposable.dispose()
      cleanupData()
      cleanupExit()
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getXtermTheme(theme)
    }
  }, [theme])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  return { containerRef, fit, focus }
}
