import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface BoardTask {
  id: string
  title: string
  prompt: string
  cwd: string
  status: 'todo' | 'processing' | 'done'
  sessionId: string | null
  claudeSessionId: string | null
  createdAt: number
  updatedAt: number
  order: number
}

export interface BoardTemplate {
  id: string
  name: string
  title: string
  prompt: string
  cwd: string | null
  createdAt: number
}

export interface BoardData {
  tasks: BoardTask[]
  templates: BoardTemplate[]
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
      if (!data.templates) data.templates = []
      // Normalize old tasks that don't have claudeSessionId
      data.tasks = data.tasks.map((t) => ({
        ...t,
        claudeSessionId: t.claudeSessionId ?? null
      }))
      return data
    } catch {
      return { tasks: [], templates: [] }
    }
  }

  save(data: BoardData): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }
}

export const boardManager = new BoardManager()
