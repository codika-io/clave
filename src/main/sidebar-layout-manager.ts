import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

/** Persisted sidebar layout: the session groups and the top-level display
 *  order that nests them. Sessions themselves survive via tmux sidecars; this
 *  is the group metadata (names, colors, terminals, ordering) that organizes
 *  them, written from the main process so it survives a hard kill (Ctrl+C /
 *  crash) the way Chromium's lazily-flushed localStorage does not. */
export interface SidebarLayout {
  groups: unknown[]
  displayOrder: string[]
}

class SidebarLayoutManager {
  private filePath: string

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'sidebar-layout.json')
  }

  load(): SidebarLayout {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as SidebarLayout
      return {
        groups: Array.isArray(data.groups) ? data.groups : [],
        displayOrder: Array.isArray(data.displayOrder) ? data.displayOrder : []
      }
    } catch {
      return { groups: [], displayOrder: [] }
    }
  }

  save(data: SidebarLayout): void {
    const payload = JSON.stringify(
      {
        groups: Array.isArray(data?.groups) ? data.groups : [],
        displayOrder: Array.isArray(data?.displayOrder) ? data.displayOrder : []
      },
      null,
      2
    )
    // Write-then-rename so a kill mid-write can never leave a truncated file.
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, payload, 'utf-8')
    fs.renameSync(tmp, this.filePath)
  }
}

export const sidebarLayoutManager = new SidebarLayoutManager()
