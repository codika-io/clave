import { execFile } from 'child_process'
import { getLoginShellEnv } from './pty-manager'

// --- State machine ---

type TitleState = 'waiting_for_input' | 'waiting_for_response' | 'done'

interface SessionEntry {
  state: TitleState
  inputBuffer: string
  cursorPos: number
}

const sessions = new Map<string, SessionEntry>()

// --- Public API ---

/** Initialize title tracking for a new Claude-mode session */
export function init(sessionId: string, prefilledInput?: string, submitted?: boolean): void {
  sessions.set(sessionId, {
    state: prefilledInput && submitted ? 'waiting_for_response' : 'waiting_for_input',
    inputBuffer: prefilledInput ?? '',
    cursorPos: prefilledInput?.length ?? 0
  })
}

/** Process raw keystroke data from pty:write */
export function registerInput(sessionId: string, data: string): void {
  const entry = sessions.get(sessionId)
  if (!entry || entry.state !== 'waiting_for_input') return

  let i = 0
  while (i < data.length) {
    const ch = data[i]
    const code = ch.charCodeAt(0)

    // ESC sequence
    if (code === 0x1b) {
      i++
      if (i >= data.length) break

      const next = data[i]

      // CSI sequence: ESC [ ... <letter>
      if (next === '[') {
        i++
        // Collect parameter bytes
        while (i < data.length && !/[A-Za-z~]/.test(data[i])) i++
        if (i < data.length) {
          const terminator = data[i]
          i++
          // Up/Down arrow → history navigation, invalidates our buffer
          if (terminator === 'A' || terminator === 'B') {
            entry.inputBuffer = ''
            entry.cursorPos = 0
          }
          // Left arrow
          else if (terminator === 'D') {
            if (entry.cursorPos > 0) entry.cursorPos--
          }
          // Right arrow
          else if (terminator === 'C') {
            if (entry.cursorPos < entry.inputBuffer.length) entry.cursorPos++
          }
          // Home
          else if (terminator === 'H') {
            entry.cursorPos = 0
          }
          // End
          else if (terminator === 'F') {
            entry.cursorPos = entry.inputBuffer.length
          }
        }
        continue
      }

      // ESC + DEL (0x7f) → word-delete backward (Option+Backspace)
      if (next.charCodeAt(0) === 0x7f) {
        i++
        const boundary = findWordBoundaryLeft(entry.inputBuffer, entry.cursorPos)
        entry.inputBuffer =
          entry.inputBuffer.slice(0, boundary) + entry.inputBuffer.slice(entry.cursorPos)
        entry.cursorPos = boundary
        continue
      }

      // ESC + b → word-nav backward (Option+Left)
      if (next === 'b') {
        i++
        entry.cursorPos = findWordBoundaryLeft(entry.inputBuffer, entry.cursorPos)
        continue
      }

      // ESC + f → word-nav forward (Option+Right)
      if (next === 'f') {
        i++
        entry.cursorPos = findWordBoundaryRight(entry.inputBuffer, entry.cursorPos)
        continue
      }

      // ESC + d → forward word-delete (Option+Delete)
      if (next === 'd') {
        i++
        const boundary = findWordBoundaryRight(entry.inputBuffer, entry.cursorPos)
        entry.inputBuffer =
          entry.inputBuffer.slice(0, entry.cursorPos) + entry.inputBuffer.slice(boundary)
        continue
      }

      // Unknown ESC sequence — skip the next char
      i++
      continue
    }

    // Carriage return — user pressed Enter (submit)
    if (ch === '\r') {
      i++
      const message = entry.inputBuffer.trim()
      if (isValidMessage(message)) {
        entry.state = 'waiting_for_response'
        return
      }
      // Invalid input (too short, slash command, y/n) — reset and keep waiting
      entry.inputBuffer = ''
      entry.cursorPos = 0
      continue
    }

    // Newline — Shift+Enter (multi-line input)
    if (ch === '\n') {
      i++
      entry.inputBuffer =
        entry.inputBuffer.slice(0, entry.cursorPos) + ' ' + entry.inputBuffer.slice(entry.cursorPos)
      entry.cursorPos++
      continue
    }

    // Backspace (DEL 0x7f or BS 0x08)
    if (code === 0x7f || code === 0x08) {
      i++
      if (entry.cursorPos > 0) {
        entry.inputBuffer =
          entry.inputBuffer.slice(0, entry.cursorPos - 1) +
          entry.inputBuffer.slice(entry.cursorPos)
        entry.cursorPos--
      }
      continue
    }

    // Ctrl+C — cancel
    if (code === 0x03) {
      i++
      entry.inputBuffer = ''
      entry.cursorPos = 0
      continue
    }

    // Ctrl+U — clear line before cursor
    if (code === 0x15) {
      i++
      entry.inputBuffer = entry.inputBuffer.slice(entry.cursorPos)
      entry.cursorPos = 0
      continue
    }

    // Ctrl+K — kill to end of line
    if (code === 0x0b) {
      i++
      entry.inputBuffer = entry.inputBuffer.slice(0, entry.cursorPos)
      continue
    }

    // Ctrl+W — delete previous word
    if (code === 0x17) {
      i++
      const boundary = findWordBoundaryLeft(entry.inputBuffer, entry.cursorPos)
      entry.inputBuffer =
        entry.inputBuffer.slice(0, boundary) + entry.inputBuffer.slice(entry.cursorPos)
      entry.cursorPos = boundary
      continue
    }

    // Ctrl+A — move to start
    if (code === 0x01) {
      i++
      entry.cursorPos = 0
      continue
    }

    // Ctrl+E — move to end
    if (code === 0x05) {
      i++
      entry.cursorPos = entry.inputBuffer.length
      continue
    }

    // Other control characters — skip
    if (code < 0x20) {
      i++
      continue
    }

    // Printable character — insert at cursor
    entry.inputBuffer =
      entry.inputBuffer.slice(0, entry.cursorPos) + ch + entry.inputBuffer.slice(entry.cursorPos)
    entry.cursorPos++
    i++
  }
}

/**
 * Called when PTY output goes idle (2s silence).
 * Returns true if title generation should proceed.
 */
export function onIdle(sessionId: string): boolean {
  const entry = sessions.get(sessionId)
  if (!entry || entry.state !== 'waiting_for_response') return false

  const message = entry.inputBuffer.trim()
  if (!isValidMessage(message)) {
    // Input became invalid (e.g. history nav cleared it) — go back to waiting
    entry.state = 'waiting_for_input'
    entry.inputBuffer = ''
    entry.cursorPos = 0
    return false
  }

  entry.state = 'done'
  return true
}

export function isAlreadyTitled(sessionId: string): boolean {
  const entry = sessions.get(sessionId)
  return !entry || entry.state === 'done'
}

export function generateTitle(sessionId: string): Promise<string> {
  const entry = sessions.get(sessionId)
  if (!entry) return Promise.reject(new Error('No session entry'))

  const userMessage = entry.inputBuffer.trim()
  if (!userMessage) return Promise.reject(new Error('No user message'))

  const prompt = `Generate a short 2-4 word title for this Claude Code terminal session based on what the user asked.
Rules:
- Return ONLY the title, no quotes, no explanation
- Be specific about what the user is working on
- Lowercase, like an IDE tab title
- Examples: "fix auth middleware", "add dark mode", "refactor store", "debug api"

User's message:
${userMessage}`

  const env = { ...getLoginShellEnv() }
  delete env.CLAUDECODE

  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p', '--model', 'haiku'],
      { env, encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 15000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('[title-gen] claude CLI error:', err.message, stderr)
          // Fall back to local heuristic
          const fallback = heuristicTitle(userMessage)
          if (fallback) {
            console.log(`[title-gen] Session ${sessionId} (heuristic): "${fallback}"`)
            resolve(fallback)
          } else {
            reject(new Error(stderr || err.message))
          }
          return
        }
        const title = stdout.trim()
        if (!title) {
          const fallback = heuristicTitle(userMessage)
          if (fallback) {
            console.log(`[title-gen] Session ${sessionId} (heuristic): "${fallback}"`)
            resolve(fallback)
          } else {
            reject(new Error('Empty response from Claude'))
          }
          return
        }
        // Reject responses that are clearly sentences, not short titles
        const wordCount = title.split(/\s+/).length
        if (wordCount > 6 || /^(I |I'm |I'll |The |This |You |It |We |My |Let )/.test(title)) {
          console.warn(`[title-gen] Rejected bad title for ${sessionId}: "${title}"`)
          const fallback = heuristicTitle(userMessage)
          if (fallback) {
            console.log(`[title-gen] Session ${sessionId} (heuristic): "${fallback}"`)
            resolve(fallback)
          } else {
            reject(new Error('Response is not a valid title'))
          }
          return
        }
        console.log(`[title-gen] Session ${sessionId}: "${title}"`)
        resolve(title)
      }
    )
    child.stdin?.write(prompt)
    child.stdin?.end()
  })
}

export function cleanup(sessionId: string): void {
  sessions.delete(sessionId)
}

// --- Helpers ---

function isValidMessage(msg: string): boolean {
  if (msg.length < 5) return false
  if (msg.startsWith('/')) return false
  if (/^(y|n|yes|no)$/i.test(msg)) return false
  return true
}

const PREFIX_RE =
  /^(please\s+|can you\s+|could you\s+|I want to\s+|I need to\s+|I need you to\s+|help me\s+)/i

function heuristicTitle(message: string): string | null {
  // Take first line
  let text = message.split(/\n/)[0].trim()
  // Strip common conversational prefixes
  text = text.replace(PREFIX_RE, '')
  // Take first 4 words, lowercase
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
  if (words.length === 0) return null
  return words.join(' ').toLowerCase()
}

function findWordBoundaryLeft(buffer: string, pos: number): number {
  let i = pos - 1
  while (i >= 0 && /\s/.test(buffer[i])) i--
  while (i >= 0 && !/\s/.test(buffer[i])) i--
  return i + 1
}

function findWordBoundaryRight(buffer: string, pos: number): number {
  let i = pos
  while (i < buffer.length && /\s/.test(buffer[i])) i++
  while (i < buffer.length && !/\s/.test(buffer[i])) i++
  return i
}
