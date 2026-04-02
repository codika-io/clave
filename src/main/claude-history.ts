import fg from 'fast-glob'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import path from 'path'

export type ClaudeHistoryRole = 'user' | 'assistant' | 'tool' | 'system' | 'unknown'
export type ClaudeHistoryRoleFilter = 'all' | 'user' | 'assistant'

export interface ClaudeHistoryProject {
  id: string
  name: string
  cwd: string
  storagePath: string
  encodedName: string
  sessionCount: number
  lastModified: string
}

export interface ClaudeHistorySession {
  id: string
  projectId: string
  projectName: string
  sessionId: string
  sourcePath: string
  cwd: string
  title: string
  summary: string
  createdAt: string
  lastModified: string
  messageCount: number
}

export interface ClaudeHistoryMessage {
  id: string
  sessionId: string
  role: ClaudeHistoryRole
  content: string
  timestamp: string
}

export interface ClaudeHistorySearchResult {
  id: string
  projectId: string
  projectName: string
  sessionId: string
  sessionTitle: string
  sourcePath: string
  messageId: string
  role: ClaudeHistoryRole
  preview: string
  content: string
  timestamp: string
}

interface ParsedJsonLine {
  uuid?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  type?: string
  isMeta?: boolean
  summary?: string
  customTitle?: string
  lastPrompt?: string
  message?: {
    role?: string
    content?: unknown
  }
}

export const CLAUDE_PROJECTS_ROOT = path.join(homedir(), '.claude', 'projects')
const SEARCH_RESULT_LIMIT = 100
const SEARCH_ALL_ROLES: ClaudeHistoryRole[] = ['user', 'assistant']

function normalizeIsoDate(value: string | undefined | null): string {
  if (!value) return new Date(0).toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString()
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readSessionIndexOriginalPath(projectStoragePath: string): Promise<string | null> {
  const indexPath = path.join(projectStoragePath, 'sessions-index.json')
  if (!(await pathExists(indexPath))) return null

  try {
    const raw = await fs.readFile(indexPath, 'utf8')
    const parsed = JSON.parse(raw) as { originalPath?: unknown }
    return typeof parsed.originalPath === 'string' && path.isAbsolute(parsed.originalPath)
      ? parsed.originalPath
      : null
  } catch {
    return null
  }
}

async function listSessionFiles(projectStoragePath: string): Promise<string[]> {
  return fg('*.jsonl', {
    cwd: projectStoragePath,
    absolute: true,
    onlyFiles: true,
    suppressErrors: true
  })
}

function parseJsonLine(line: string): ParsedJsonLine | null {
  if (!line.trim()) return null
  try {
    return JSON.parse(line) as ParsedJsonLine
  } catch {
    return null
  }
}

async function readLines(filePath: string): Promise<string[]> {
  const raw = await fs.readFile(filePath, 'utf8')
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>
    const blockType = typeof block.type === 'string' ? block.type : null

    if (typeof block.text === 'string') {
      parts.push(block.text)
      continue
    }

    if (typeof block.content === 'string') {
      parts.push(block.content)
      continue
    }

    if (typeof block.thinking === 'string') {
      parts.push(block.thinking)
      continue
    }

    if (blockType === 'tool_use' && typeof block.name === 'string') {
      parts.push(block.name)
      continue
    }

    if (blockType === 'tool_result') {
      if (typeof block.content === 'string') {
        parts.push(block.content)
      } else if (Array.isArray(block.content)) {
        parts.push(extractTextFromContent(block.content))
      }
    }
  }

  return parts.join('\n').trim()
}

function normalizeDisplayText(value: string, maxLength = 240): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trimEnd()}…` : compact
}

function stripMarkdownForSearchDisplay(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}([^`]+?)`{1,3}/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
}

function normalizeSearchableText(value: string): string {
  return stripMarkdownForSearchDisplay(value).replace(/\s+/g, ' ').trim()
}

function matchesSearchRole(role: ClaudeHistoryRole, roleFilter: ClaudeHistoryRoleFilter): boolean {
  if (roleFilter === 'all') {
    return SEARCH_ALL_ROLES.includes(role)
  }
  return role === roleFilter
}

function isLikelyClaudeCommand(text: string): boolean {
  return (
    text.startsWith('<command-name>/') ||
    text.startsWith('<local-command-stdout>') ||
    text.startsWith('<local-command-stderr>') ||
    text.startsWith('<local-command-caveat>') ||
    text.startsWith('<command-message>') ||
    text.startsWith('<task-notification>')
  )
}

function isLikelyToolResultNoise(text: string): boolean {
  return (
    text.startsWith('File created successfully at:') ||
    text.startsWith('The file ') ||
    text.startsWith('User has answered your questions:') ||
    text.startsWith('User has approved your plan.') ||
    text.startsWith('Entered plan mode.') ||
    text.startsWith('Web search results for query:') ||
    text.startsWith('(Bash completed') ||
    text.startsWith('Exit code ') ||
    text.startsWith('To suppress this warning,') ||
    text === '405'
  )
}

function isMeaningfulPromptCandidate(text: string): boolean {
  if (!text) return false
  if (isLikelyClaudeCommand(text)) return false
  if (isLikelyToolResultNoise(text)) return false
  return true
}

function resolveMessageRole(entry: ParsedJsonLine): ClaudeHistoryRole {
  const role = entry.message?.role
  if (role === 'user') {
    const content = entry.message?.content
    if (
      Array.isArray(content) &&
      content.length > 0 &&
      content.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).type === 'tool_result'
      )
    ) {
      return 'tool'
    }
  }

  if (role === 'user' || role === 'assistant' || role === 'system') return role
  if (entry.type === 'user' || entry.type === 'assistant') return entry.type
  return 'unknown'
}

function buildPreview(content: string, query: string): string {
  const trimmed = normalizeSearchableText(content)
  if (!trimmed) return ''

  const lowerContent = trimmed.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const matchIndex = lowerContent.indexOf(lowerQuery)
  if (matchIndex === -1) return trimmed.slice(0, 180)

  const start = Math.max(0, matchIndex - 60)
  const end = Math.min(trimmed.length, matchIndex + query.length + 60)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < trimmed.length ? '...' : ''
  return `${prefix}${trimmed.slice(start, end)}${suffix}`
}

async function resolveProjectCwd(projectStoragePath: string, sessionFiles: string[]): Promise<string> {
  const originalPath = await readSessionIndexOriginalPath(projectStoragePath)
  if (originalPath) return originalPath

  for (const filePath of sessionFiles.slice(0, 3)) {
    try {
      const lines = await readLines(filePath)
      for (const line of lines.slice(0, 30)) {
        const entry = parseJsonLine(line)
        if (entry?.cwd && path.isAbsolute(entry.cwd)) {
          return entry.cwd
        }
      }
    } catch {
      // Ignore malformed session files and continue with the next candidate.
    }
  }

  return projectStoragePath
}

async function getNewestFileTimestamp(sessionFiles: string[]): Promise<string> {
  let newest = 0
  for (const filePath of sessionFiles) {
    try {
      const stats = await fs.stat(filePath)
      newest = Math.max(newest, stats.mtimeMs)
    } catch {
      // Ignore transient file errors.
    }
  }
  return new Date(newest || 0).toISOString()
}

function sortByRecent<T extends { lastModified: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  )
}

function sortSearchResults(items: ClaudeHistorySearchResult[]): ClaudeHistorySearchResult[] {
  return [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

export async function listClaudeHistoryProjects(): Promise<ClaudeHistoryProject[]> {
  if (!(await pathExists(CLAUDE_PROJECTS_ROOT))) return []

  const entries = await fs.readdir(CLAUDE_PROJECTS_ROOT, { withFileTypes: true })
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const storagePath = path.join(CLAUDE_PROJECTS_ROOT, entry.name)
        const sessionFiles = await listSessionFiles(storagePath)
        if (sessionFiles.length === 0) return null

        const cwd = await resolveProjectCwd(storagePath, sessionFiles)
        const name = path.basename(cwd) || entry.name
        const lastModified = await getNewestFileTimestamp(sessionFiles)

        return {
          id: storagePath,
          name,
          cwd,
          storagePath,
          encodedName: entry.name,
          sessionCount: sessionFiles.length,
          lastModified
        } satisfies ClaudeHistoryProject
      })
  )

  return sortByRecent(projects.filter((project): project is ClaudeHistoryProject => project !== null))
}

export async function loadClaudeHistorySessions(projectId: string): Promise<ClaudeHistorySession[]> {
  const sessionFiles = await listSessionFiles(projectId)
  const projectCwd = await resolveProjectCwd(projectId, sessionFiles)
  const projectName = path.basename(projectCwd) || path.basename(projectId)
  const sessions = await Promise.all(
    sessionFiles.map(async (filePath) => {
      const lines = await readLines(filePath)
      let actualSessionId = path.basename(filePath, '.jsonl')
      let cwd = ''
      let createdAt = ''
      let lastModified = ''
      let summary = ''
      let explicitSummary = ''
      let customTitle = ''
      let lastPrompt = ''
      let firstUserMessage = ''
      let latestSnippet = ''
      let messageCount = 0

      for (const line of lines) {
        const entry = parseJsonLine(line)
        if (!entry || entry.isMeta) continue

        if (!cwd && typeof entry.cwd === 'string') cwd = entry.cwd
        if (!createdAt && entry.timestamp) createdAt = normalizeIsoDate(entry.timestamp)
        if (entry.timestamp) lastModified = normalizeIsoDate(entry.timestamp)
        if (entry.sessionId) actualSessionId = entry.sessionId

        if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
          const normalizedCustomTitle = normalizeDisplayText(entry.customTitle)
          if (normalizedCustomTitle) {
            customTitle = normalizedCustomTitle
          }
          continue
        }

        if (entry.type === 'last-prompt' && typeof entry.lastPrompt === 'string') {
          const normalizedLastPrompt = normalizeDisplayText(entry.lastPrompt)
          if (normalizedLastPrompt) {
            lastPrompt = normalizedLastPrompt
          }
          continue
        }

        if (entry.type === 'summary' && typeof entry.summary === 'string' && !summary) {
          explicitSummary = normalizeDisplayText(entry.summary)
          continue
        }

        const text = extractTextFromContent(entry.message?.content)
        if (!text) continue

        const role = resolveMessageRole(entry)
        if (role === 'unknown') continue

        messageCount += 1
        const normalizedText = normalizeDisplayText(text)
        if (!normalizedText) continue

        latestSnippet = normalizedText
        if (!firstUserMessage && role === 'user' && isMeaningfulPromptCandidate(normalizedText)) {
          firstUserMessage = normalizedText
        }
      }

      if (!lastModified) {
        const stats = await fs.stat(filePath)
        lastModified = new Date(stats.mtimeMs).toISOString()
      }

      if (!createdAt) createdAt = lastModified

      const title =
        customTitle ||
        lastPrompt ||
        explicitSummary ||
        firstUserMessage ||
        path.basename(cwd || projectName) ||
        actualSessionId.slice(0, 8)
      summary = latestSnippet || firstUserMessage || explicitSummary

      return {
        id: filePath,
        projectId,
        projectName,
        sessionId: actualSessionId,
        sourcePath: filePath,
        cwd: cwd || projectId,
        title,
        summary,
        createdAt,
        lastModified,
        messageCount
      } satisfies ClaudeHistorySession
    })
  )

  return sortByRecent(sessions)
}

export async function loadClaudeHistoryMessages(sourcePath: string): Promise<ClaudeHistoryMessage[]> {
  const lines = await readLines(sourcePath)
  const messages: ClaudeHistoryMessage[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const entry = parseJsonLine(lines[index])
    if (!entry || entry.isMeta) continue

    const role = resolveMessageRole(entry)
    if (role === 'unknown') continue

    const content = extractTextFromContent(entry.message?.content)
    if (!content) continue

    messages.push({
      id: entry.uuid || `${path.basename(sourcePath)}:${index}`,
      sessionId: entry.sessionId || path.basename(sourcePath, '.jsonl'),
      role,
      content,
      timestamp: normalizeIsoDate(entry.timestamp)
    })
  }

  return messages
}

export async function searchClaudeHistoryMessages(
  query: string,
  roleFilter: ClaudeHistoryRoleFilter = 'all',
  limit = SEARCH_RESULT_LIMIT
): Promise<ClaudeHistorySearchResult[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const projects = await listClaudeHistoryProjects()
  const sessionsByProject = await Promise.all(
    projects.map(async (project) => ({
      project,
      sessions: await loadClaudeHistorySessions(project.id)
    }))
  )

  const results: ClaudeHistorySearchResult[] = []
  for (const { project, sessions } of sessionsByProject) {
    for (const session of sessions) {
      const messages = await loadClaudeHistoryMessages(session.sourcePath)
      for (const message of messages) {
        if (!matchesSearchRole(message.role, roleFilter)) continue

        const searchableContent = normalizeSearchableText(message.content)
        if (!searchableContent.toLowerCase().includes(trimmedQuery.toLowerCase())) continue

        results.push({
          id: `${session.id}:${message.id}`,
          projectId: project.id,
          projectName: project.name,
          sessionId: session.sessionId,
          sessionTitle: normalizeSearchableText(session.title) || session.title,
          sourcePath: session.sourcePath,
          messageId: message.id,
          role: message.role,
          preview: buildPreview(searchableContent, trimmedQuery),
          content: searchableContent,
          timestamp: message.timestamp
        })

        if (results.length >= limit) {
          return sortSearchResults(results)
        }
      }
    }
  }

  return sortSearchResults(results)
}
