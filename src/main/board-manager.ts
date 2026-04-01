import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface BoardTask {
  id: string
  title: string
  prompt: string
  cwd: string
  dangerousMode: boolean
  createdAt: number
  updatedAt: number
}

export interface BoardData {
  tasks: BoardTask[]
}

class BoardManager {
  private filePath: string

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'board.json')
  }

  load(): BoardData {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as BoardData
      // Migrate old kanban tasks: only keep unrun tasks (status 'todo' or no status)
      // and strip removed fields
      const raw_tasks = data.tasks as unknown as Array<Record<string, unknown>>
      data.tasks = raw_tasks
        .filter((t) => !t.status || t.status === 'todo')
        .map((t) => ({
          id: t.id as string,
          title: (t.title as string) ?? '',
          prompt: (t.prompt as string) ?? '',
          cwd: t.cwd as string,
          dangerousMode: t.dangerousMode === true,
          createdAt: t.createdAt as number,
          updatedAt: t.updatedAt as number
        }))
      return data
    } catch {
      return { tasks: [] }
    }
  }

  save(data: BoardData): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }
}

export const boardManager = new BoardManager()
