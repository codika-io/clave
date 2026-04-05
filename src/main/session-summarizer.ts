// src/main/session-summarizer.ts
import { execFile } from 'child_process'
import { getLoginShellEnv } from './pty-manager'
import {
  listClaudeHistoryProjects,
  loadClaudeHistorySessions,
  loadClaudeHistoryMessages
} from './claude-history'

const SUMMARY_MODEL = 'claude-haiku-4-5-20251001'
const MAX_MESSAGES = 40
const MAX_CONTENT_LENGTH = 500

const SUMMARY_PROMPT = `Summarize this Claude session in 1-2 sentences. Focus on what was accomplished or produced. Be specific. Do not start with "The user" or "In this session".

Examples:
- "Built a work tracker widget with break reminders and weekly trends in the sidebar footer."
- "Drafted 3 paragraphs on dark factory automation for a newsletter article."
- "Fixed authentication bug where JWT tokens expired during active sessions."
- "Researched and compared 5 vector database options, recommending Pinecone for the use case."
- "Refactored the payment module from classes to hooks, reducing code by 40%."

Now summarize this conversation:
`

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}

export async function summarizeSession(
  claudeSessionId: string,
  cwd: string
): Promise<string | null> {
  // Find the session's history messages
  const projects = await listClaudeHistoryProjects()
  const project = projects.find((p) => cwd.startsWith(p.cwd))
  if (!project) return null

  const sessions = await loadClaudeHistorySessions(project.id)
  const session = sessions.find((s) => s.sessionId === claudeSessionId)
  if (!session) return null

  const messages = await loadClaudeHistoryMessages(session.sourcePath)
  if (messages.length === 0) return null

  // Build condensed transcript — take first and last messages, skip tool noise
  const relevant = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_MESSAGES)

  const transcript = relevant
    .map((m) => `${m.role}: ${truncate(m.content, MAX_CONTENT_LENGTH)}`)
    .join('\n')

  const fullPrompt = SUMMARY_PROMPT + transcript

  // Spawn claude -p with haiku model
  return new Promise((resolve) => {
    const env = getLoginShellEnv()
    const shell = process.env.SHELL || '/bin/zsh'

    // Use login shell to ensure claude is on PATH
    const child = execFile(
      shell,
      ['-lc', `claude -p --model ${SUMMARY_MODEL} --max-turns 1 --no-session-persistence`],
      {
        env: { ...env, TERM: 'xterm-256color' },
        timeout: 30000,
        maxBuffer: 1024 * 1024
      },
      (err, stdout) => {
        if (err) {
          console.error('[session-summarizer] Failed to generate summary:', err.message)
          resolve(null)
        } else {
          const summary = stdout.trim()
          resolve(summary || null)
        }
      }
    )

    // Send the prompt via stdin
    if (child.stdin) {
      child.stdin.write(fullPrompt)
      child.stdin.end()
    }
  })
}
