import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface LaunchTemplateSession {
  id: string
  cwd: string
  name: string
}

export interface LaunchTemplateGroup {
  id: string
  name: string
  sessionIds: string[]
}

export interface LaunchTemplate {
  id: string
  name: string
  sessions: LaunchTemplateSession[]
  groups: LaunchTemplateGroup[]
  displayOrder: string[]
  createdAt: number
  updatedAt: number
}

export interface LaunchTemplatesData {
  templates: LaunchTemplate[]
  defaultTemplateId: string
}

export interface ValidationResult {
  valid: LaunchTemplateSession[]
  missing: LaunchTemplateSession[]
}

class TemplateManager {
  private filePath: string

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'launch-templates.json')
  }

  load(): LaunchTemplatesData {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as LaunchTemplatesData
      if (!data.templates) data.templates = []
      if (!data.defaultTemplateId) data.defaultTemplateId = 'blank'
      return data
    } catch {
      return { templates: [], defaultTemplateId: 'blank' }
    }
  }

  save(data: LaunchTemplatesData): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  validateTemplate(template: LaunchTemplate): ValidationResult {
    const valid: LaunchTemplateSession[] = []
    const missing: LaunchTemplateSession[] = []

    for (const session of template.sessions) {
      try {
        fs.statSync(session.cwd)
        valid.push(session)
      } catch {
        missing.push(session)
      }
    }

    return { valid, missing }
  }
}

export const templateManager = new TemplateManager()
