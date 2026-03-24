import { execFile } from 'child_process'
import { getLoginShellEnv } from './pty-manager'

const ANSI_REGEX =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]/g

interface SessionBuffer {
  buffer: string
  userMessage: string | null
  titled: boolean
}

const sessions = new Map<string, SessionBuffer>()

const MAX_BUFFER = 8000
const PROMPT_BUFFER = 3000

export function accumulate(sessionId: string, data: string): void {
  let entry = sessions.get(sessionId)
  if (!entry) {
    entry = { buffer: '', userMessage: null, titled: false }
    sessions.set(sessionId, entry)
  }
  if (entry.titled || entry.userMessage) return
  if (entry.buffer.length >= MAX_BUFFER) return
  const stripped = data.replace(ANSI_REGEX, '')
  entry.buffer = (entry.buffer + stripped).slice(0, MAX_BUFFER)

  // Try to extract the user's first message from the prompt marker
  if (!entry.userMessage) {
    entry.userMessage = extractUserMessage(entry.buffer)
  }
}

/** Extract the user's first message by finding the ❯ prompt marker */
function extractUserMessage(buffer: string): string | null {
  const lines = buffer.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const match = trimmed.match(/^❯\s*(.+)/)
    if (!match) continue
    const text = match[1].trim()
    // Skip empty or slash commands
    if (!text || text.startsWith('/')) continue
    // Verify Claude started responding (non-empty lines after this one)
    const hasResponse = lines.slice(i + 1).some((l) => l.trim().length > 0)
    if (hasResponse) return text
  }
  return null
}

export function hasUserMessage(sessionId: string): boolean {
  return !!sessions.get(sessionId)?.userMessage
}

export function getBufferLength(sessionId: string): number {
  return sessions.get(sessionId)?.buffer.length ?? 0
}

/** Clear the buffer (e.g. after startup banner, before real conversation starts) */
export function resetBuffer(sessionId: string): void {
  const entry = sessions.get(sessionId)
  if (entry) entry.buffer = ''
}

export function isAlreadyTitled(sessionId: string): boolean {
  return sessions.get(sessionId)?.titled ?? false
}

export function generateTitle(sessionId: string): Promise<string> {
  const entry = sessions.get(sessionId)
  if (!entry || entry.titled) return Promise.reject(new Error('No buffer or already titled'))

  entry.titled = true

  const userMessage = entry.userMessage
  const prompt = userMessage
    ? `Generate a short 2-4 word title for this Claude Code terminal session based on what the user asked.
Rules:
- Return ONLY the title, no quotes, no explanation
- Be specific about what the user is working on
- Lowercase, like an IDE tab title
- Examples: "fix auth middleware", "add dark mode", "refactor store", "debug api"

User's message:
${userMessage}`
    : `Generate a short 2-4 word title for this Claude Code terminal session.
Rules:
- Return ONLY the title, no quotes, no explanation
- Be specific about what the user is working on
- Lowercase, like an IDE tab title
- Examples: "fix auth middleware", "add dark mode", "refactor store", "debug api"

Session output:
${entry.buffer.slice(0, PROMPT_BUFFER)}`

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
          reject(new Error(stderr || err.message))
          return
        }
        const title = stdout.trim()
        if (!title) {
          reject(new Error('Empty response from Claude'))
          return
        }
        // Reject responses that are clearly sentences, not short titles
        const wordCount = title.split(/\s+/).length
        if (wordCount > 6 || /^(I |I'm |I'll |The |This |You |It |We |My |Let )/.test(title)) {
          console.warn(`[title-gen] Rejected bad title for ${sessionId}: "${title}"`)
          reject(new Error('Response is not a valid title'))
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
