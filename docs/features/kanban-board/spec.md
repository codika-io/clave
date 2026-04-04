# Kanban Board — Phase 1 Spec

**Status:** COMPLETED (2026-04-04)

All typecheck clean. Tested manually.

### Post-spec additions (delivered in Phase 1)
- "View" button on cards with linked sessions — jumps to terminal session
- Session-aware card indicator: green "Running" vs gray "Session ended" based on actual session alive status
- **Resume** button on cards with ended sessions — resumes the Claude Code conversation instead of starting fresh
- Delete task confirmation dialog
- Delete column confirmation — blocks deletion if column has tasks, prompts user to move them first
- Move column left/right via column context menu
- Horizontal scroll fix for boards with many columns
- `AppShell.tsx` updated with `min-w-0` to allow overflow scrolling

## Goal
Replace the flat task queue with a column-based kanban board. Tasks can be organized into columns, dragged between them, and persist after being run.

## Current State (what exists)

### Data
- `BoardTask`: `{ id, title, prompt, cwd, dangerousMode, createdAt, updatedAt }`
- `BoardData`: `{ tasks: BoardTask[] }`
- Persisted to `~/Library/Application Support/clave/board.json`
- No concept of columns or status — flat array

### Store (`board-store.ts`, 70 lines)
- Zustand store with: `loadBoard`, `addTask`, `updateTask`, `deleteTask`, `removeTask`
- Debounced save (300ms) to disk via IPC
- `removeTask` and `deleteTask` are identical (both filter by id)

### UI (`KanbanBoard.tsx`, 273 lines)
- Search bar + "Add Task" button
- Flat list with hover "Run" button
- Right-click context menu (Edit, Delete)
- Tasks deleted on run (line 100: `removeTask(task.id)`)

### Main process (`board-manager.ts`, 55 lines)
- Reads/writes `board.json`
- Has migration logic: filters old kanban data to only keep `status: 'todo'` tasks
- This confirms columns/status USED TO exist but were stripped out

### Sidebar (`SidebarSections.tsx`)
- Shows task count badge
- Lists tasks with truncated labels
- Click navigates to board view

### Drag-drop
- Sidebar has hand-rolled DnD (`use-sidebar-dnd.ts`) for session reordering
- No DnD library in dependencies
- Board has no drag-drop at all

### IPC
- `board:load` / `board:save` — simple read/write of entire BoardData

## Phase 1 Design

### Data Model Changes

```typescript
// Column behavior type — determines what the system can do with this column
type ColumnBehavior = 
  | 'default-inbox'    // Where new tasks land. Exactly one column has this.
  | 'active'           // Tasks here represent running/in-progress work
  | 'terminal'         // End state — tasks here are "done" (archive, clear, etc.)
  | 'none'             // No special behavior — purely user-organized

// Column definition
interface BoardColumn {
  id: string           // UUID
  title: string        // Display name
  order: number        // Sort position
  builtIn: boolean     // true = shipped with Clave, false = user-created
  behavior: ColumnBehavior  // Drives system logic (run targets, auto-move, sidebar filtering)
  locked?: boolean     // If true, column cannot be deleted or have behavior changed
  color?: string       // Optional column accent color (future use)
}

// Extended task
interface BoardTask {
  id: string
  title: string
  prompt: string       // Claude Code instruction — sent to session on run
  notes: string        // NEW — freeform notes (context, reasoning, links, acceptance criteria)
  cwd: string
  dangerousMode: boolean
  createdAt: number
  updatedAt: number
  columnId: string     // NEW — which column this task belongs to
  order: number        // NEW — position within column
  sessionId?: string   // NEW — linked session (set when task is run)
}

// Extended board data
interface BoardData {
  tasks: BoardTask[]
  columns: BoardColumn[]  // NEW
}
```

#### Column Behavior System

Columns have a `behavior` field that the system uses to make decisions. This decouples UI layout from system logic — users can rename, reorder, or add columns freely while the system still knows where to put things.

| Behavior | System uses it for | Constraint |
|---|---|---|
| `default-inbox` | Where `addTask()` puts new tasks | Exactly one column must have this |
| `active` | Where `runTask()` moves tasks | Zero or one column (if zero, tasks stay in place on run) |
| `terminal` | Sidebar hides these tasks, future "clear done" action | Zero or more |
| `none` | Nothing — user organizes freely | No constraints |

**Why behaviors instead of hardcoded column IDs:**
- Users can rename "Backlog" to "Ideas" and it still works as the inbox
- Users can add columns like "Blocked" or "In Review" with `none` behavior
- Future built-in behaviors (e.g., `auto-archive`, `needs-review`) can be added without schema changes
- System logic (`runTask`, sidebar filtering, Phase 2 auto-move) queries by behavior, not by column name or ID

#### Default Columns (fresh install or migration)

| # | Title | Behavior | Built-in | Locked |
|---|---|---|---|---|
| 1 | Backlog | `default-inbox` | true | false |
| 2 | Ready | `none` | true | false |
| 3 | Running | `active` | true | false |
| 4 | Done | `terminal` | true | false |

- Built-in columns can be renamed and reordered but show a subtle indicator
- Built-in columns can be deleted unless `locked` (none are locked in Phase 1, but the field exists for future use)
- Deleting a column with tasks moves those tasks to the `default-inbox` column
- User-created columns always get `behavior: 'none'` in Phase 1

#### Adding User Columns

Users can add columns via:
- "+" button at the end of the column row
- Column context menu → "Add column after"

User columns get `{ builtIn: false, behavior: 'none' }`. In a future phase, power users could assign behaviors to user columns (e.g., make a second "active" column for parallel workstreams).

### Migration Path
The `board-manager.ts` already handles migration. We extend it:
- If `board.json` has no `columns` field → create default columns
- Existing tasks get `columnId` set to the `default-inbox` column, `order` based on existing array position
- Existing tasks get `notes: ''` (empty string default)
- Old `status: 'todo'` filter in migration continues to work

### Store Changes (`board-store.ts`)

New state:
```typescript
interface BoardState {
  tasks: BoardTask[]
  columns: BoardColumn[]
  loaded: boolean

  // Existing
  loadBoard: () => Promise<void>
  addTask: (task: ...) => void      // auto-targets default-inbox column
  updateTask: (id, updates) => void
  deleteTask: (id: string) => void

  // New — task operations
  moveTask: (taskId: string, toColumnId: string, toOrder: number) => void
  runTask: (task: BoardTask) => Promise<void>  // moved from component

  // New — column operations
  addColumn: (title: string, afterColumnId?: string) => void
  updateColumn: (id: string, updates: Partial<Pick<BoardColumn, 'title' | 'order' | 'color'>>) => void
  deleteColumn: (id: string) => void  // moves tasks to default-inbox column
  reorderColumns: (columnIds: string[]) => void

  // New — behavior queries (derived, not stored)
  getColumnByBehavior: (behavior: ColumnBehavior) => BoardColumn | undefined
  getInboxColumn: () => BoardColumn  // guaranteed to exist
}
```

Remove `removeTask` (duplicate of `deleteTask`).

**Behavior queries** are helper methods, not state. They find columns by behavior so system logic never references column IDs or titles directly:
- `runTask` → finds `active` column via `getColumnByBehavior('active')`
- `addTask` → finds inbox via `getInboxColumn()`
- Sidebar filtering → hides tasks in `terminal` behavior columns

### UI Changes (`KanbanBoard.tsx`)

**Layout:** Horizontal scrolling container with vertical column lanes.

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  Backlog    │  Ready      │  Running    │  Done       │
│             │             │             │             │
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │
│ │ Task A  │ │ │ Task C  │ │ │ Task D  │ │ │ Task E  │ │
│ │ ~/proj  │ │ │ ~/api   │ │ │ ~/api   │ │ │ ~/proj  │ │
│ └─────────┘ │ └─────────┘ │ │ ● active │ │ └─────────┘ │
│ ┌─────────┐ │             │ └─────────┘ │             │
│ │ Task B  │ │             │             │             │
│ │ ~/web   │ │             │             │             │
│ └─────────┘ │             │             │             │
│             │             │             │             │
│ [+ Add]     │ [+ Add]     │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

**Components to create/modify:**
- `KanbanBoard.tsx` → rewrite as column layout (keep `TaskQueue` export name for compatibility)
- `KanbanColumn.tsx` → new, renders a single column with its tasks
- `KanbanCard.tsx` → new, renders a single task card
- `TaskForm.tsx` → rework: accept `columnId`, add notes field, reorder fields (title → notes → prompt → folder)
- `TaskDetailPanel.tsx` → **new** — expanded card view for editing all fields inline
- `ColumnForm.tsx` → new, simple inline form for add/rename column

**Card design:**
- Title (or first line of notes/prompt as fallback)
- Notes preview — first 2 lines, muted text, truncated
- Folder path (shortened)
- Prompt indicator — small icon/badge showing a prompt is attached (not the full text)
- Age badge
- Danger mode badge (if enabled)
- Hover: Run button (for Backlog/Ready columns), Edit, Delete
- Running column cards: show session status indicator if `sessionId` is set
- Drag handle area
- Click card → opens detail/edit view (see below)

**Card detail view (inline expand or modal):**
When a card is clicked, it expands or opens a modal showing the full editable content:
- **Title** — editable inline
- **Notes** — markdown-capable textarea for context, reasoning, acceptance criteria, links
- **Prompt** — separate textarea, monospace, clearly labeled "Prompt (sent to Claude Code on run)"
- **Folder** — with browse button
- **Danger mode** toggle
- **Metadata** — created date, last updated, linked session (if any)

This separates the "thinking" (notes) from the "doing" (prompt). A task in Backlog might start with just notes and no prompt. As the user refines the task and moves it toward Ready, they write the prompt. The prompt is what gets sent to Claude Code on run — notes are for the user.

**Column header:**
- Title (click to rename inline)
- Task count
- Subtle behavior indicator for built-in columns (e.g., inbox icon, play icon for active)
- "+" button to add task directly to this column
- "..." menu: rename, add column after, delete column (disabled if it's the sole inbox)
- Drop zone highlight when dragging over

**Add column button:**
- "+" column at the far right of the board
- Creates a user column with `behavior: 'none'`

### Drag and Drop

**Approach:** Hand-roll it, matching the pattern in `use-sidebar-dnd.ts`. No new dependencies.

Create `use-board-dnd.ts` hook:
- Drag a card between columns or reorder within a column
- Visual: ghost card follows cursor, drop zone highlights between cards and on column headers
- On drop: call `moveTask(taskId, targetColumnId, targetOrder)`
- Support multi-card drag later (Phase 2), single card for now

Why hand-roll:
- Consistent with existing codebase (sidebar DnD is hand-rolled)
- No new dependency
- Full control over drop zone behavior

### Run Task Flow (changed)

Current: Run → delete task → create session
New: Run → move task to `active` column → set `sessionId` → create session

```typescript
const runTask = async (task: BoardTask) => {
  // Prompt is required to run — notes alone aren't enough
  if (!task.prompt.trim()) {
    // Open card detail so user can write a prompt
    openTaskDetail(task.id)
    return
  }

  const sessionInfo = await window.electronAPI.spawnSession(task.cwd, { ... })
  addSession({ ... })

  // Move to active column (if one exists), otherwise stay in place
  const activeCol = getColumnByBehavior('active')
  if (activeCol) {
    moveTask(task.id, activeCol.id, 0)
  }
  updateTask(task.id, { sessionId: sessionInfo.id })

  selectSession(sessionInfo.id, false)
  // ... auto-send prompt logic unchanged
}
```

Note: if the user deletes the `active` behavior column, running a task still works — it just stays in its current column with a `sessionId` attached. The behavior system degrades gracefully.

**Task lifecycle with notes vs. prompt:**
1. User creates task in Backlog with just a title and notes ("need to refactor auth middleware, see issue #42")
2. User refines notes, adds acceptance criteria
3. When ready, user writes the actual prompt ("Refactor the auth middleware in src/middleware/auth.ts to...")
4. User drags to Ready or clicks Run
5. Run requires a prompt — if missing, opens card detail to write one
6. Prompt is sent to Claude Code session; notes stay on the card for reference

### Sidebar Changes

The sidebar `TaskQueueSection` currently shows a flat list. Update to:
- Show total task count (across all columns)
- Group by column in the expandable list (or just show non-Done tasks)
- Keep it simple — the sidebar is a quick glance, the board is the full view

### What Phase 1 Does NOT Include
- Auto-movement based on session events (Phase 2) — but session-aware indicators and resume are done
- Tags (Phase 3)
- History integration (Phase 4) — but session linking and resume are done
- Column color customization
- WIP limits
- Filtering by column

## Files to Change

| File | Change |
|---|---|
| `src/main/board-manager.ts` | Add `columns` to data model, migration logic |
| `src/preload/index.d.ts` | Add `BoardColumn` type, update `BoardData` and `BoardTask` |
| `src/renderer/src/store/board-store.ts` | Add column state, `moveTask`, column CRUD |
| `src/renderer/src/components/board/KanbanBoard.tsx` | Rewrite as column layout |
| `src/renderer/src/components/board/KanbanColumn.tsx` | **New** — single column component |
| `src/renderer/src/components/board/KanbanCard.tsx` | **New** — task card component |
| `src/renderer/src/components/board/TaskDetailPanel.tsx` | **New** — expanded card edit view (notes, prompt, metadata) |
| `src/renderer/src/components/board/ColumnForm.tsx` | **New** — add/rename column |
| `src/renderer/src/components/board/TaskForm.tsx` | Rework: add `notes` field, `columnId`, reorder fields |
| `src/renderer/src/hooks/use-board-dnd.ts` | **New** — drag-drop for cards between columns |
| `src/renderer/src/components/layout/SidebarSections.tsx` | Update task list grouping |

## Decisions Log

| Decision | Rationale |
|---|---|
| Hand-roll DnD, no library | Matches existing codebase pattern, no new deps |
| 4 default columns | Covers typical workflow; user can customize |
| Tasks persist after run | Core value prop — track work through lifecycle |
| `sessionId` on task | Enables Phase 2 live status without additional linking |
| `order` field on tasks and columns | Explicit ordering survives JSON round-trip |
| Keep `TaskQueue` export name | Avoids changing AppShell/view routing |
| `behavior` field on columns | Decouples system logic from column names/IDs. Users can rename freely. New behaviors can be added without schema migration. System queries by behavior, never by title. |
| `builtIn` flag on columns | Distinguishes shipped columns from user-created. Enables future "reset to defaults" and subtle UI differentiation without restricting user freedom. |
| `locked` field (unused in Phase 1) | Reserved for future columns that must not be deleted (e.g., a required inbox). Exists in schema now to avoid migration later. |
| User columns always `behavior: 'none'` in Phase 1 | Keep it simple. Phase 2+ can let power users assign behaviors to custom columns. |
| Graceful degradation | If user deletes a behavior column (e.g., no `active` column), system still works — tasks stay in place. No hard failures from column configuration. |

---

## Phase 2: Auto-Movement via Session Events

**Status:** COMPLETED (2026-04-04)

### Architecture

A React hook (`use-board-session-sync`) subscribes to the session store via Zustand's `.subscribe()` API. It tracks previous session `alive` states in a `useRef<Map>` and detects `alive: true → false` transitions. On transition, it finds the linked board task and moves it to the terminal-behavior column.

No new IPC or main-process changes — all activity detection already exists in the renderer via `use-terminal.ts`.

### Card Status States

| State | Condition | Visual |
|---|---|---|
| Working | `alive && activityStatus === 'active'` | Green pulsing dot |
| Idle | `alive && activityStatus === 'idle'` | Blue solid dot |
| Needs permission | `alive && promptWaiting === 'is asking for permission'` | Amber pulsing dot + amber border glow |
| Waiting for input | `alive && promptWaiting === 'is asking a question'` | Amber pulsing dot + amber border glow |
| Session ended | `!alive` | Gray solid dot |

Prompt states (amber) take visual priority over activity states (green/blue).

### Auto-Move Rules

| Transition | Action |
|---|---|
| Session ends (`alive: true → false`) | Card moves to terminal-behavior column (Done) |

Only session end triggers auto-movement. Active/idle transitions are visual-only on the card.

### Task Detail Panel Integration
Session status and action buttons are shown in the task detail modal:
- Same 5-state indicator as the card
- View button to jump to linked session
- Resume button for ended sessions
- Run button for tasks without a session

### Post-Plan Fixes
- Primitive Zustand selectors for `sessionAlive`, `activityStatus`, `promptWaiting` — returns scalars instead of session objects for reliable `Object.is` equality checks
- Run button shows on cards with missing sessions (after app restart) — `canRun` gates on `!sessionAlive` instead of `canResume`

### What Phase 2 Does NOT Include
- Auto-move on idle (too noisy — Claude flickers active/idle frequently)
- Dedicated "Needs Attention" column (amber indicator is sufficient)
- Configurable auto-movement rules
- Error vs normal end distinction (session store doesn't differentiate)
- History↔Board integration (resuming from History doesn't update board card — Phase 4)

---

## Phase 3: Tagging System

**Status:** COMPLETED (2026-04-04)

### Data Model

```typescript
interface TagDefinition {
  name: string    // Normalized: lowercase, trimmed, no leading #
  color: string   // Color ID: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'pink' | 'cyan' | 'orange'
}

// BoardTask gains:
tags: string[]    // Tag names referencing TagDefinition.name

// BoardData gains:
tags: TagDefinition[]   // Board-level definitions
```

### Color Palette

8 colors using Tailwind opacity classes for background (`bg-{color}-500/15`) and full saturation for text (`text-{color}-400`). Works across dark, light, and coffee themes.

New tags auto-assign the next unused color from the palette (round-robin).

### Tag Input

Autocomplete input component:
- Type to search existing tags
- Enter to add highlighted suggestion or create new tag
- Backspace on empty input removes last tag
- Arrow keys navigate suggestions
- "Create ..." option appears for new tag names
- Tags displayed as removable pills inside the input

### Board Filter

Tag filter bar appears below search when tags exist:
- Shows all defined tags as clickable pills
- Click to toggle filter — only tasks with that tag are shown
- Active filter gets a ring indicator
- "Clear" button to deactivate filter
- Filter is in-memory only (not persisted)

### What Phase 3 Does NOT Include
- Tags on sessions (session store untouched)
- Auto-tagging by folder or prompt content
- Tag management UI (rename, bulk operations)
- Multi-tag filtering (AND/OR)
- Tag color customization per-tag (uses auto-assigned palette color)

---

## Phase 4: History Integration

**Status:** COMPLETED (2026-04-04)

### The Problem

`BoardTask.sessionId` is a transient Clave runtime ID — gone after app restart. Without it, the board can't find the task's history or offer resume.

### Solution: `claudeSessionId`

Added `claudeSessionId?: string` to `BoardTask`. This is Claude's persistent session UUID (same as `ClaudeHistorySession.sessionId`), persisted to `board.json`, and set during `runTask()`.

**Resume chain after restart:**
1. Board reads `task.claudeSessionId` from disk
2. Calls `spawnSession({ resumeSessionId: claudeSessionId })`
3. PTY runs `claude --resume <uuid>`

**History lookup:**
1. Board reads `task.claudeSessionId`
2. Searches `historyStore.sessionsByProject` for matching `sessionId`
3. Displays summary, message count, duration from the history session

### Card Enhancements

Completed cards (no active session + has `claudeSessionId`) show:
- Session summary text (2 lines, truncated)
- Message count

### Detail Panel Enhancements

When `task.claudeSessionId` exists:
- History section with summary, stats (messages, duration, age)
- "Browse History" button → navigates to HistoryPanel with session selected

### What Phase 4 Does NOT Include
- Inline conversation viewer (reuses existing HistoryPanel)
- History search from board
- Auto-linking historical tasks
- LLM-powered conversation summarization

---

## Phase 5: Universal Session Tracking

**Status:** COMPLETED (2026-04-04)

### The Problem

Only kanban-started sessions got board cards. Sessions from sidebar, history, duplicates, etc. bypassed the board entirely.

### Solution: Session-Start Detection Hook

Extended `use-board-session-sync` to detect new sessions via snapshot diffing (same pattern used for session-end detection). When a new Claude-mode local session appears without a linked board task, a card is auto-created in the active column.

**Included sessions:** Claude-mode + local (sidebar new, history resume, duplicate, AppShell menu)
**Excluded sessions:** Terminals, remote, template/pinned startup

### Active Column Protection

The active-behavior column gets `locked: true` via migration. The existing `deleteColumn` logic already returns early on locked columns, and `KanbanColumn.tsx` hides the delete menu item.

### What Phase 5 Does NOT Include
- Terminal/remote session tracking
- Startup session tracking (templates, pinned groups)
- Auto-title sync from session auto-detection
- Retroactive card creation for existing sessions

---

## Upstream Contribution Notes
This feature is a good upstream candidate — it's a natural evolution of the existing queue. Keep the implementation clean of fork-specific patterns. The migration handles the transition from flat list to columns gracefully.
