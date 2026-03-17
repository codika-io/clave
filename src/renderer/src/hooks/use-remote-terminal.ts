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

// eslint-disable-next-line no-control-regex
const LOCALHOST_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})(?:\/\S*)?/i

function detectLocalhostUrl(buffer: string): string | null {
  const match = buffer.match(LOCALHOST_URL_RE)
  return match ? match[0] : null
}

function detectPrompt(buffer: string): string | null {
  const tail = buffer.slice(-500)
  if (/Esc.*cancel/i.test(tail)) return 'is asking for permission'
  if (/Allow/i.test(tail) && /Deny/i.test(tail)) return 'is asking for permission'
  if (/\(Y\/n\)|\[Y\/n\]|\(y\/N\)|\[y\/N\]/i.test(tail)) return 'is asking a question'
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

const COFFEE_THEME = {
  background: '#eeebe5',
  foreground: '#1b1610',
  cursor: 'rgba(27, 22, 16, 0.7)',
  cursorAccent: '#eeebe5',
  selectionBackground: 'rgba(120, 100, 80, 0.15)',
  selectionForeground: undefined,
  black: '#1b1610',
  red: '#c53030',
  green: '#2f855a',
  yellow: '#b7791f',
  blue: '#2b6cb0',
  magenta: '#805ad5',
  cyan: '#0e7490',
  white: '#d0cbc3',
  brightBlack: '#756e66',
  brightRed: '#e53e3e',
  brightGreen: '#38a169',
  brightYellow: '#d69e2e',
  brightBlue: '#3182ce',
  brightMagenta: '#9f7aea',
  brightCyan: '#0891b2',
  brightWhite: '#9b9590'
}

function getXtermTheme(theme: Theme) {
  if (theme === 'coffee') return COFFEE_THEME
  return theme === 'dark' ? DARK_THEME : LIGHT_THEME
}

export function useRemoteTerminal(shellId: string) {
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

    // Custom key bindings — bypass xterm.js local processing, send directly to SSH shell
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      // Shift+Enter → newline
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        window.electronAPI.sshShellWrite(shellId, '\n')
        return false
      }
      // Option+Backspace → word delete backward
      if (e.key === 'Backspace' && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        window.electronAPI.sshShellWrite(shellId, '\x1b\x7f')
        return false
      }
      // Option+Delete → forward word delete
      if (e.key === 'Delete' && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        window.electronAPI.sshShellWrite(shellId, '\x1bd')
        return false
      }
      // Option+Left → word backward
      if (e.key === 'ArrowLeft' && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        window.electronAPI.sshShellWrite(shellId, '\x1bb')
        return false
      }
      // Option+Right → word forward
      if (e.key === 'ArrowRight' && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        window.electronAPI.sshShellWrite(shellId, '\x1bf')
        return false
      }
      return true
    })

    // Wire terminal input -> SSH shell
    const inputDisposable = terminal.onData((data) => {
      window.electronAPI.sshShellWrite(shellId, data)
    })

    // Wire terminal resize -> SSH shell
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      window.electronAPI.sshShellResize(shellId, cols, rows)
    })

    const { setSessionActivity, setSessionPromptWaiting, setSessionDetectedUrl, setSessionUnseenActivity, updateSessionAlive } =
      useSessionStore.getState()

    // Activity tracking: debounce from active → idle after silence
    let activityTimer: ReturnType<typeof setTimeout> | null = null
    let activeStartTimer: ReturnType<typeof setTimeout> | null = null
    let notificationTimer: ReturnType<typeof setTimeout> | null = null
    let outputBuffer = ''
    let isMarkedActive = false

    // Wire SSH shell output -> terminal
    const cleanupData = window.electronAPI.onSshShellData(shellId, (data) => {
      terminal.write(data)

      // Only mark active after sustained output (50ms) to avoid flicker
      if (!isMarkedActive) {
        if (!activeStartTimer) {
          activeStartTimer = setTimeout(() => {
            isMarkedActive = true
            setSessionActivity(shellId, 'active')
            setSessionPromptWaiting(shellId, null)
            activeStartTimer = null
          }, 50)
        }
      } else {
        setSessionPromptWaiting(shellId, null)
      }

      // Append stripped data to rolling buffer (max 500 chars)
      outputBuffer = (outputBuffer + stripAnsi(data)).slice(-500)

      // Detect localhost URLs in output
      const detectedUrl = detectLocalhostUrl(outputBuffer)
      if (detectedUrl) {
        setSessionDetectedUrl(shellId, detectedUrl)
      }

      // Mark unseen activity if this session is not currently selected
      const { selectedSessionIds } = useSessionStore.getState()
      if (!selectedSessionIds.includes(shellId)) {
        setSessionUnseenActivity(shellId, true)
      }

      if (activityTimer) clearTimeout(activityTimer)
      if (notificationTimer) {
        clearTimeout(notificationTimer)
        notificationTimer = null
      }

      activityTimer = setTimeout(() => {
        isMarkedActive = false
        if (activeStartTimer) {
          clearTimeout(activeStartTimer)
          activeStartTimer = null
        }
        setSessionActivity(shellId, 'idle')

        // Check for prompt patterns after idle detection
        const promptType = detectPrompt(outputBuffer)
        setSessionPromptWaiting(shellId, promptType)
        if (promptType) {
          notificationTimer = setTimeout(() => {
            const session = useSessionStore
              .getState()
              .sessions.find((s) => s.id === shellId)
            const title = session?.name ?? session?.folderName ?? 'Clave'
            window.electronAPI.showNotification?.({
              title,
              body: `Claude ${promptType}`,
              sessionId: shellId
            })
          }, 3000)
        }
      }, 2000)
    })

    // Handle SSH shell exit
    const cleanupExit = window.electronAPI.onSshShellExit(shellId, () => {
      terminal.write('\r\n\x1b[90m[Remote session ended]\x1b[0m\r\n')
      if (activityTimer) clearTimeout(activityTimer)
      activityTimer = null
      if (notificationTimer) {
        clearTimeout(notificationTimer)
        notificationTimer = null
      }
      updateSessionAlive(shellId, false)
      setSessionDetectedUrl(shellId, null)

      const session = useSessionStore.getState().sessions.find((s) => s.id === shellId)
      const title = session?.name ?? session?.folderName ?? 'Clave'
      window.electronAPI.showNotification?.({
        title,
        body: 'Remote session has ended',
        sessionId: shellId
      })
    })

    // ResizeObserver for auto-fitting
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
    window.electronAPI.sshShellResize(shellId, terminal.cols, terminal.rows)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      if (activityTimer) clearTimeout(activityTimer)
      if (activeStartTimer) clearTimeout(activeStartTimer)
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
  }, [shellId])

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
