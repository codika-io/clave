import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export type ColumnBehavior = 'default-inbox' | 'active' | 'terminal' | 'none'

export interface BoardColumn {
  id: string
  title: string
  order: number
  builtIn: boolean
  behavior: ColumnBehavior
  locked?: boolean
  color?: string
}

export interface TagDefinition {
  name: string
  color: string
}

export interface BoardTask {
  id: string
  title: string
  prompt: string
  notes: string
  cwd: string
  dangerousMode: boolean
  createdAt: number
  updatedAt: number
  columnId: string
  order: number
  sessionId?: string
  claudeSessionId?: string
  tags: string[]
}

export interface BoardData {
  tasks: BoardTask[]
  columns: BoardColumn[]
  tags: TagDefinition[]
}

function createDefaultColumns(): BoardColumn[] {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Backlog',
      order: 0,
      builtIn: true,
      behavior: 'default-inbox'
    },
    { id: crypto.randomUUID(), title: 'Ready', order: 1, builtIn: true, behavior: 'none' },
    { id: crypto.randomUUID(), title: 'Running', order: 2, builtIn: true, behavior: 'active', locked: true },
    { id: crypto.randomUUID(), title: 'Done', order: 3, builtIn: true, behavior: 'terminal' }
  ]
}

class BoardManager {
  private filePath: string

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'board.json')
  }

  load(): BoardData {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as Record<string, unknown>

      // Ensure columns exist (migration from flat task list)
      let columns: BoardColumn[]
      if (Array.isArray(data.columns) && data.columns.length > 0) {
        columns = data.columns as BoardColumn[]
      } else {
        columns = createDefaultColumns()
      }

      // Migration: lock the active-behavior column
      columns = columns.map((c) =>
        c.behavior === 'active' && !c.locked ? { ...c, locked: true } : c
      )

      const inboxColumn = columns.find((c) => c.behavior === 'default-inbox') ?? columns[0]

      // Migrate tasks: filter old kanban statuses, add new fields
      const rawTasks = (data.tasks ?? []) as Array<Record<string, unknown>>
      const tasks: BoardTask[] = rawTasks
        .filter((t) => !t.status || t.status === 'todo')
        .map((t, index) => ({
          id: t.id as string,
          title: (t.title as string) ?? '',
          prompt: (t.prompt as string) ?? '',
          notes: (t.notes as string) ?? '',
          cwd: t.cwd as string,
          dangerousMode: t.dangerousMode === true,
          createdAt: t.createdAt as number,
          updatedAt: t.updatedAt as number,
          columnId: (t.columnId as string) ?? inboxColumn.id,
          order: typeof t.order === 'number' ? (t.order as number) : index,
          sessionId: (t.sessionId as string) ?? undefined,
          claudeSessionId: (t.claudeSessionId as string) ?? undefined,
          tags: Array.isArray(t.tags) ? (t.tags as string[]) : []
        }))

      const tags: TagDefinition[] = Array.isArray(data.tags) ? (data.tags as TagDefinition[]) : []

      return { tasks, columns, tags }
    } catch {
      return { tasks: [], columns: createDefaultColumns(), tags: [] }
    }
  }

  save(data: BoardData): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }
}

export const boardManager = new BoardManager()
