# Kanban Board Phase 3: Tagging System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tagging system to kanban board tasks with color-coded pills, autocomplete, and board-level filtering.

**Architecture:** Tags are strings stored on each `BoardTask`. Tag definitions (name-to-color mapping) are stored at the `BoardData` level so colors are consistent across all tasks. The board gets a filter bar that lets users click tags to filter visible tasks. Tag input uses an autocomplete dropdown populated from existing tag definitions.

**Tech Stack:** React 19, Zustand 5, Tailwind CSS v4, TypeScript

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/preload/index.d.ts` | Modify | Add `tags` to `BoardTask`, add `TagDefinition` and `tags` to `BoardData` |
| `src/main/board-manager.ts` | Modify | Migration: default `tags: []` on tasks, `tags: []` on board data |
| `src/renderer/src/store/board-store.ts` | Modify | Tag CRUD on board data, `activeTagFilter` state, update `updateTask` type |
| `src/renderer/src/components/board/TagPill.tsx` | Create | Reusable color-coded tag pill (used on cards, filter bar, inputs) |
| `src/renderer/src/components/board/TagInput.tsx` | Create | Autocomplete tag input with create-on-enter |
| `src/renderer/src/components/board/KanbanCard.tsx` | Modify | Show tag pills below notes preview |
| `src/renderer/src/components/board/KanbanBoard.tsx` | Modify | Tag filter bar above columns, filter logic |
| `src/renderer/src/components/board/TaskDetailPanel.tsx` | Modify | Tag editing section |
| `src/renderer/src/components/board/TaskForm.tsx` | Modify | Tag input on task creation |

---

## Tag Color Palette

8 predefined colors that work across dark, light, and coffee themes. Each color uses Tailwind classes with opacity for background and full saturation for text:

```typescript
const TAG_COLORS = [
  { id: 'blue',    bg: 'bg-blue-500/15',    text: 'text-blue-400',    dot: 'bg-blue-400'    },
  { id: 'green',   bg: 'bg-green-500/15',   text: 'text-green-400',   dot: 'bg-green-400'   },
  { id: 'amber',   bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400'   },
  { id: 'red',     bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400'     },
  { id: 'purple',  bg: 'bg-purple-500/15',  text: 'text-purple-400',  dot: 'bg-purple-400'  },
  { id: 'pink',    bg: 'bg-pink-500/15',    text: 'text-pink-400',    dot: 'bg-pink-400'    },
  { id: 'cyan',    bg: 'bg-cyan-500/15',    text: 'text-cyan-400',    dot: 'bg-cyan-400'    },
  { id: 'orange',  bg: 'bg-orange-500/15',  text: 'text-orange-400',  dot: 'bg-orange-400'  },
] as const
```

New tags auto-assign the next unused color (round-robin through palette). Users can change color via the tag input's dropdown.

---

### Task 1: Data Model — Types and Migration

**Files:**
- Modify: `src/preload/index.d.ts:108-137`
- Modify: `src/main/board-manager.ts:1-102`

- [ ] **Step 1: Add `TagDefinition` type and update `BoardTask` and `BoardData` in preload types**

In `src/preload/index.d.ts`, add the `TagDefinition` interface before `BoardData`, add `tags` to `BoardTask`, and add `tags` to `BoardData`:

```typescript
// Add after the BoardColumn interface (after line 118):

export interface TagDefinition {
  name: string    // Normalized: lowercase, trimmed, no leading #
  color: string   // Color ID from palette (e.g., 'blue', 'green', 'amber')
}

// In BoardTask interface, add after sessionId (line 132):
  tags: string[]           // Tag names (references TagDefinition.name)

// In BoardData interface, add after columns (line 137):
  tags: TagDefinition[]    // Board-level tag definitions (name → color)
```

The full updated `BoardTask` should be:

```typescript
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
  tags: string[]
}
```

The full updated `BoardData` should be:

```typescript
export interface BoardData {
  tasks: BoardTask[]
  columns: BoardColumn[]
  tags: TagDefinition[]
}
```

- [ ] **Step 2: Update `board-manager.ts` types to match and add migration logic**

In `src/main/board-manager.ts`, add the `TagDefinition` interface after the existing `BoardTask` interface:

```typescript
export interface TagDefinition {
  name: string
  color: string
}
```

Update the `BoardData` interface:

```typescript
export interface BoardData {
  tasks: BoardTask[]
  columns: BoardColumn[]
  tags: TagDefinition[]
}
```

Add `tags` field to the `BoardTask` interface:

```typescript
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
  tags: string[]
}
```

In the `load()` method, update the task migration to default `tags`:

```typescript
// In the .map() for rawTasks, add:
tags: Array.isArray(t.tags) ? (t.tags as string[]) : []
```

Also migrate the board-level tags array:

```typescript
// After parsing columns, before returning:
const tags: TagDefinition[] = Array.isArray(data.tags) ? (data.tags as TagDefinition[]) : []

return { tasks, columns, tags }
```

Update the fallback return in the catch block:

```typescript
return { tasks: [], columns: createDefaultColumns(), tags: [] }
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: Type errors in `board-store.ts` (it doesn't know about `tags` yet). That's expected — we'll fix it in Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.d.ts src/main/board-manager.ts
git commit -m "feat(board): add tag types and migration for Phase 3 tagging"
```

---

### Task 2: Board Store — Tag State and Operations

**Files:**
- Modify: `src/renderer/src/store/board-store.ts:1-209`

- [ ] **Step 1: Import the new `TagDefinition` type and update the store interface**

Update the import at line 2:

```typescript
import type { BoardTask, BoardData, BoardColumn, ColumnBehavior, TagDefinition } from '../../../preload/index.d'
```

Add to the `BoardState` interface, after the `loaded` field:

```typescript
  tags: TagDefinition[]
  activeTagFilter: string | null  // null = no filter, string = tag name to filter by
```

Add new methods to the interface:

```typescript
  addTag: (name: string, color?: string) => void
  removeTag: (name: string) => void
  updateTagColor: (name: string, color: string) => void
  setActiveTagFilter: (tagName: string | null) => void
```

Update the `updateTask` type signature to include `tags`:

```typescript
  updateTask: (
    id: string,
    updates: Partial<
      Pick<BoardTask, 'title' | 'prompt' | 'notes' | 'cwd' | 'dangerousMode' | 'sessionId' | 'tags'>
    >
  ) => void
```

- [ ] **Step 2: Add the TAG_COLORS palette constant**

Add before the `create` call (before line 43):

```typescript
const TAG_COLORS = [
  'blue', 'green', 'amber', 'red', 'purple', 'pink', 'cyan', 'orange'
] as const

function nextTagColor(existingTags: TagDefinition[]): string {
  const usedColors = new Set(existingTags.map((t) => t.color))
  return TAG_COLORS.find((c) => !usedColors.has(c)) ?? TAG_COLORS[existingTags.length % TAG_COLORS.length]
}
```

- [ ] **Step 3: Update the store initial state and `loadBoard`**

Add initial state after `columns: []`:

```typescript
  tags: [],
  activeTagFilter: null,
```

Update `loadBoard` to set tags:

```typescript
  loadBoard: async () => {
    if (!window.electronAPI?.boardLoad) return
    const data = await window.electronAPI.boardLoad()
    set({ tasks: data.tasks, columns: data.columns, tags: data.tags ?? [], loaded: true })
  },
```

- [ ] **Step 4: Update `debouncedSave` to include tags**

```typescript
function debouncedSave(state: { tasks: BoardTask[]; columns: BoardColumn[]; tags: TagDefinition[] }): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: BoardData = { tasks: state.tasks, columns: state.columns, tags: state.tags }
    window.electronAPI?.boardSave?.(data)
  }, 300)
}
```

Update every call to `debouncedSave` throughout the store to include `tags`:

- In `addTask`: `debouncedSave({ tasks: newTasks, columns: state.columns, tags: state.tags })`
- In `updateTask`: `debouncedSave({ tasks: newTasks, columns: state.columns, tags: state.tags })`
- In `deleteTask`: `debouncedSave({ tasks: newTasks, columns: state.columns, tags: state.tags })`
- In `moveTask`: `debouncedSave({ tasks: newTasks, columns: state.columns, tags: state.tags })`
- In `addColumn`: `debouncedSave({ tasks: state.tasks, columns: newColumns, tags: state.tags })`
- In `updateColumn`: `debouncedSave({ tasks: state.tasks, columns: newColumns, tags: state.tags })`
- In `deleteColumn`: `debouncedSave({ tasks: newTasks, columns: newColumns, tags: state.tags })`
- In `reorderColumns`: `debouncedSave({ tasks: state.tasks, columns: newColumns, tags: state.tags })`

- [ ] **Step 5: Update `addTask` to include `tags` field**

In the `addTask` method, the new task object should include:

```typescript
    const task: BoardTask = {
      id: crypto.randomUUID(),
      title: partial.title,
      prompt: partial.prompt,
      notes: partial.notes,
      cwd: partial.cwd,
      dangerousMode: partial.dangerousMode,
      createdAt: now,
      updatedAt: now,
      columnId,
      order: tasksInColumn.length,
      sessionId: undefined,
      tags: partial.tags ?? []
    }
```

Update the `addTask` parameter type to include `tags`:

```typescript
  addTask: (
    task: Omit<BoardTask, 'id' | 'createdAt' | 'updatedAt' | 'columnId' | 'order'> & {
      columnId?: string
    }
  ) => void
```

(No change needed — `tags` is already part of `BoardTask` so it comes through the Omit.)

- [ ] **Step 6: Add tag management methods**

Add after the `getInboxColumn` method:

```typescript
  addTag: (name, color) => {
    const state = get()
    const normalized = name.trim().toLowerCase().replace(/^#/, '')
    if (!normalized) return
    if (state.tags.some((t) => t.name === normalized)) return
    const newTags = [...state.tags, { name: normalized, color: color ?? nextTagColor(state.tags) }]
    set({ tags: newTags })
    debouncedSave({ tasks: state.tasks, columns: state.columns, tags: newTags })
  },

  removeTag: (name) => {
    const state = get()
    const newTags = state.tags.filter((t) => t.name !== name)
    // Also remove from all tasks
    const newTasks = state.tasks.map((t) =>
      t.tags.includes(name) ? { ...t, tags: t.tags.filter((tag) => tag !== name), updatedAt: Date.now() } : t
    )
    set({ tags: newTags, tasks: newTasks })
    if (state.activeTagFilter === name) set({ activeTagFilter: null })
    debouncedSave({ tasks: newTasks, columns: state.columns, tags: newTags })
  },

  updateTagColor: (name, color) => {
    const state = get()
    const newTags = state.tags.map((t) => (t.name === name ? { ...t, color } : t))
    set({ tags: newTags })
    debouncedSave({ tasks: state.tasks, columns: state.columns, tags: newTags })
  },

  setActiveTagFilter: (tagName) => {
    set({ activeTagFilter: tagName })
  },
```

- [ ] **Step 7: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: May have errors in components that create tasks without `tags`. Fix by adding `tags: []` to task creation calls in `TaskForm.tsx`. If so, add `tags: []` in the `handleSubmit` of `TaskForm.tsx` inside the `addTask` call:

```typescript
addTask({
  title: title.trim(),
  notes: notes.trim(),
  prompt: prompt.trim(),
  cwd: cwd.trim(),
  dangerousMode,
  tags: [],
  columnId
})
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/store/board-store.ts src/renderer/src/components/board/TaskForm.tsx
git commit -m "feat(board): add tag state, CRUD operations, and filter to board store"
```

---

### Task 3: TagPill Component

**Files:**
- Create: `src/renderer/src/components/board/TagPill.tsx`

- [ ] **Step 1: Create the `TagPill` component**

Create `src/renderer/src/components/board/TagPill.tsx`:

```tsx
import { XMarkIcon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'

const TAG_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue:   { bg: 'bg-blue-500/15',   text: 'text-blue-400'   },
  green:  { bg: 'bg-green-500/15',  text: 'text-green-400'  },
  amber:  { bg: 'bg-amber-500/15',  text: 'text-amber-400'  },
  red:    { bg: 'bg-red-500/15',    text: 'text-red-400'    },
  purple: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  pink:   { bg: 'bg-pink-500/15',   text: 'text-pink-400'   },
  cyan:   { bg: 'bg-cyan-500/15',   text: 'text-cyan-400'   },
  orange: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
}

const DEFAULT_COLOR = { bg: 'bg-surface-200', text: 'text-text-secondary' }

interface TagPillProps {
  name: string
  color: string
  size?: 'sm' | 'md'
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
}

export function TagPill({ name, color, size = 'sm', onRemove, onClick, active }: TagPillProps) {
  const colors = TAG_COLOR_MAP[color] ?? DEFAULT_COLOR

  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium transition-colors',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        colors.bg,
        colors.text,
        onClick && 'cursor-pointer hover:opacity-80',
        active && 'ring-1 ring-current'
      )}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="hover:opacity-60 transition-opacity"
        >
          <XMarkIcon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        </button>
      )}
    </span>
  )
}

export { TAG_COLOR_MAP }
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS (no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/board/TagPill.tsx
git commit -m "feat(board): add TagPill component with color palette"
```

---

### Task 4: TagInput Component

**Files:**
- Create: `src/renderer/src/components/board/TagInput.tsx`

- [ ] **Step 1: Create the `TagInput` component with autocomplete**

Create `src/renderer/src/components/board/TagInput.tsx`:

```tsx
import { useState, useRef, useCallback, useEffect } from 'react'
import { useBoardStore } from '../../store/board-store'
import { TagPill, TAG_COLOR_MAP } from './TagPill'
import { cn } from '../../lib/utils'
import type { TagDefinition } from '../../../../preload/index.d'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const boardTags = useBoardStore((s) => s.tags)
  const addTag = useBoardStore((s) => s.addTag)

  const [input, setInput] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const normalized = input.trim().toLowerCase().replace(/^#/, '')

  const suggestions = boardTags.filter(
    (t) => t.name.includes(normalized) && !tags.includes(t.name)
  )

  const showCreate = normalized && !boardTags.some((t) => t.name === normalized) && !tags.includes(normalized)
  const totalOptions = suggestions.length + (showCreate ? 1 : 0)

  useEffect(() => {
    setHighlightIdx(0)
  }, [input])

  const addTagToTask = useCallback(
    (name: string) => {
      const norm = name.trim().toLowerCase().replace(/^#/, '')
      if (!norm) return
      if (tags.includes(norm)) return

      // Ensure tag definition exists at board level
      if (!boardTags.some((t) => t.name === norm)) {
        addTag(norm)
      }

      onChange([...tags, norm])
      setInput('')
      setShowDropdown(false)
      inputRef.current?.focus()
    },
    [tags, boardTags, addTag, onChange]
  )

  const removeTagFromTask = useCallback(
    (name: string) => {
      onChange(tags.filter((t) => t !== name))
    },
    [tags, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (totalOptions > 0 && showDropdown) {
          if (highlightIdx < suggestions.length) {
            addTagToTask(suggestions[highlightIdx].name)
          } else if (showCreate) {
            addTagToTask(normalized)
          }
        } else if (normalized) {
          addTagToTask(normalized)
        }
      } else if (e.key === 'Backspace' && !input && tags.length > 0) {
        removeTagFromTask(tags[tags.length - 1])
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((i) => Math.min(i + 1, totalOptions - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Escape') {
        setShowDropdown(false)
      }
    },
    [input, tags, normalized, suggestions, showCreate, highlightIdx, totalOptions, addTagToTask, removeTagFromTask, showDropdown]
  )

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const getTagColor = (name: string): string => {
    return boardTags.find((t) => t.name === name)?.color ?? 'blue'
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-lg bg-surface-200 min-h-[32px]">
        {tags.map((tag) => (
          <TagPill
            key={tag}
            name={tag}
            color={getTagColor(tag)}
            size="md"
            onRemove={() => removeTagFromTask(tag)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? 'Add tags...' : ''}
          className="flex-1 min-w-[60px] bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && totalOptions > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg bg-surface-100 border border-border shadow-lg overflow-hidden">
          {suggestions.map((tag, idx) => (
            <button
              key={tag.name}
              onClick={() => addTagToTask(tag.name)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-surface-200 transition-colors text-left',
                idx === highlightIdx && 'bg-surface-200'
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  TAG_COLOR_MAP[tag.color]?.bg?.replace('/15', '') ?? 'bg-surface-300'
                )}
                style={{ backgroundColor: getComputedDotColor(tag.color) }}
              />
              {tag.name}
            </button>
          ))}
          {showCreate && (
            <button
              onClick={() => addTagToTask(normalized)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-200 transition-colors text-left',
                highlightIdx === suggestions.length && 'bg-surface-200'
              )}
            >
              Create "<span className="text-text-primary">{normalized}</span>"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function getComputedDotColor(colorId: string): string {
  const colorMap: Record<string, string> = {
    blue: '#60a5fa', green: '#4ade80', amber: '#fbbf24', red: '#f87171',
    purple: '#c084fc', pink: '#f472b6', cyan: '#22d3ee', orange: '#fb923c'
  }
  return colorMap[colorId] ?? '#6b7280'
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/board/TagInput.tsx
git commit -m "feat(board): add TagInput component with autocomplete and create-on-enter"
```

---

### Task 5: Tag Pills on Cards

**Files:**
- Modify: `src/renderer/src/components/board/KanbanCard.tsx:1-182`

- [ ] **Step 1: Import TagPill and board store tags**

Add import at the top of `KanbanCard.tsx`:

```typescript
import { TagPill } from './TagPill'
```

Add a selector inside the component to get tag definitions for color lookup:

```typescript
const boardTags = useBoardStore((s) => s.tags)
```

Add the import for `useBoardStore` (it's not currently imported — only `useSessionStore` is):

```typescript
import { useBoardStore } from '../../store/board-store'
```

- [ ] **Step 2: Add tag pills between the notes preview and metadata row**

After the notes preview section (after the closing `)}` of `notesPreview &&` block, around line 99), add:

```tsx
      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {task.tags.map((tagName) => {
            const def = boardTags.find((t) => t.name === tagName)
            return (
              <TagPill
                key={tagName}
                name={tagName}
                color={def?.color ?? 'blue'}
              />
            )
          })}
        </div>
      )}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/board/KanbanCard.tsx
git commit -m "feat(board): show color-coded tag pills on kanban cards"
```

---

### Task 6: Tag Editing in TaskDetailPanel

**Files:**
- Modify: `src/renderer/src/components/board/TaskDetailPanel.tsx:1-315`

- [ ] **Step 1: Import TagInput and add tags state**

Add import:

```typescript
import { TagInput } from './TagInput'
```

Add state variable after `dangerousMode` state (around line 39):

```typescript
const [tags, setTags] = useState<string[]>([])
```

- [ ] **Step 2: Initialize tags from task in the useEffect**

In the `useEffect` that sets form values from `task` (around line 42-49), add:

```typescript
setTags(task.tags ?? [])
```

So the effect becomes:

```typescript
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNotes(task.notes)
      setPrompt(task.prompt)
      setCwd(task.cwd)
      setDangerousMode(task.dangerousMode)
      setTags(task.tags ?? [])
    }
  }, [task])
```

- [ ] **Step 3: Update the save callback to include tags**

Update the `save` callback (around line 52-61) to include `tags`:

```typescript
  const save = useCallback(() => {
    if (!task) return
    updateTask(task.id, {
      title: title.trim(),
      notes: notes.trim(),
      prompt: prompt.trim(),
      cwd: cwd.trim(),
      dangerousMode,
      tags
    })
  }, [task, title, notes, prompt, cwd, dangerousMode, tags, updateTask])
```

- [ ] **Step 4: Add the tag input section in the form**

Add after the Danger mode toggle (after the `</label>` closing tag around line 200), before the session status section:

```tsx
                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Tags
                  </label>
                  <TagInput
                    tags={tags}
                    onChange={(newTags) => {
                      setTags(newTags)
                      if (task) updateTask(task.id, { tags: newTags })
                    }}
                  />
                </div>
```

- [ ] **Step 5: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/board/TaskDetailPanel.tsx
git commit -m "feat(board): add tag editing to task detail panel"
```

---

### Task 7: Tag Input in TaskForm

**Files:**
- Modify: `src/renderer/src/components/board/TaskForm.tsx:1-248`

- [ ] **Step 1: Import TagInput and add tags state**

Add import:

```typescript
import { TagInput } from './TagInput'
```

Add state variable after `dangerousMode` state (around line 27):

```typescript
const [tags, setTags] = useState<string[]>([])
```

- [ ] **Step 2: Initialize tags in the form open effect**

In the `useEffect` that handles form open (around line 30-47), update the `if (editTask)` branch to include tags:

```typescript
if (editTask) {
  setTitle(editTask.title)
  setNotes(editTask.notes)
  setPrompt(editTask.prompt)
  setCwd(editTask.cwd)
  setDangerousMode(editTask.dangerousMode)
  setTags(editTask.tags ?? [])
} else {
  setTitle('')
  setNotes('')
  setPrompt('')
  setCwd('')
  setDangerousMode(false)
  setTags([])
}
```

Also update the `editTask` prop type to include `tags`:

```typescript
editTask?: {
  id: string
  title: string
  prompt: string
  notes: string
  cwd: string
  dangerousMode: boolean
  tags?: string[]
} | null
```

- [ ] **Step 3: Update handleSubmit to include tags**

In `handleSubmit` (around line 66-92), update both the `updateTask` and `addTask` calls to include `tags`:

```typescript
if (editTask) {
  updateTask(editTask.id, {
    title: title.trim(),
    notes: notes.trim(),
    prompt: prompt.trim(),
    cwd: cwd.trim(),
    dangerousMode,
    tags
  })
} else {
  addTask({
    title: title.trim(),
    notes: notes.trim(),
    prompt: prompt.trim(),
    cwd: cwd.trim(),
    dangerousMode,
    tags,
    columnId
  })
}
```

Update the `useCallback` dependency array to include `tags`:

```typescript
[title, notes, prompt, cwd, dangerousMode, tags, columnId, editTask, addTask, updateTask, onClose]
```

- [ ] **Step 4: Add tag input section to the form UI**

Add after the danger mode toggle (around line 215), before the closing `</div>` of the form body (`space-y-3` div):

```tsx
                {/* Tags */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Tags</label>
                  <TagInput tags={tags} onChange={setTags} />
                </div>
```

- [ ] **Step 5: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/board/TaskForm.tsx
git commit -m "feat(board): add tag input to task creation and edit form"
```

---

### Task 8: Tag Filter Bar on Board

**Files:**
- Modify: `src/renderer/src/components/board/KanbanBoard.tsx:1-335`

- [ ] **Step 1: Import TagPill and add tag filter state from store**

Add import:

```typescript
import { TagPill } from './TagPill'
```

Add store selectors inside `TaskQueue` component (after existing selectors, around line 24):

```typescript
const boardTags = useBoardStore((s) => s.tags)
const activeTagFilter = useBoardStore((s) => s.activeTagFilter)
const setActiveTagFilter = useBoardStore((s) => s.setActiveTagFilter)
```

- [ ] **Step 2: Update `filteredTasks` to respect tag filter**

Update the `filteredTasks` memo (around line 53-63) to also filter by active tag:

```typescript
  const filteredTasks = useMemo(() => {
    let result = tasks
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.prompt.toLowerCase().includes(q) ||
          t.notes.toLowerCase().includes(q) ||
          t.cwd.toLowerCase().includes(q)
      )
    }
    if (activeTagFilter) {
      result = result.filter((t) => t.tags.includes(activeTagFilter))
    }
    return result
  }, [tasks, search, activeTagFilter])
```

- [ ] **Step 3: Add the tag filter bar to the top bar**

In the top bar section (around line 246-259), add the tag filter row after the search input div. The tag filter bar should only appear when tags exist:

Replace the entire top bar block:

```tsx
      {/* Top bar: search + tag filter */}
      <div className="flex flex-col border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full h-7 pl-8 pr-3 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
            />
          </div>
        </div>
        {boardTags.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 pb-3 flex-wrap">
            <span className="text-[11px] text-text-tertiary mr-0.5">Filter:</span>
            {boardTags.map((tag) => (
              <TagPill
                key={tag.name}
                name={tag.name}
                color={tag.color}
                size="md"
                active={activeTagFilter === tag.name}
                onClick={() =>
                  setActiveTagFilter(activeTagFilter === tag.name ? null : tag.name)
                }
              />
            ))}
            {activeTagFilter && (
              <button
                onClick={() => setActiveTagFilter(null)}
                className="text-[11px] text-text-tertiary hover:text-text-secondary ml-1"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Verify the app builds**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npx electron-vite build`

Expected: Build succeeds without errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/board/KanbanBoard.tsx
git commit -m "feat(board): add tag filter bar to kanban board"
```

---

### Task 9: Update Docs

**Files:**
- Modify: `docs/ideas/kanban-board.md`
- Modify: `docs/features/kanban-board/spec.md`

- [ ] **Step 1: Update `docs/ideas/kanban-board.md`**

Update Phase 3 section from future tense to completed:

```markdown
## What's Been Built (Phase 3) -- Completed 2026-04-04

### Tagging System
- **Tag definitions** stored at board level with color mapping
- 8-color palette: blue, green, amber, red, purple, pink, cyan, orange
- Auto-assigns next unused color when creating a tag
- **Color-coded tag pills** on kanban cards
- **Tag input with autocomplete** — type to search existing tags, Enter to create new ones
- Backspace removes last tag, arrow keys navigate suggestions
- **Board-level tag filter** — click any tag pill in the filter bar to show only matching tasks
- "Clear" button to remove active filter
- Tags editable in both TaskForm (create/edit) and TaskDetailPanel (detail view)
- Tags persist through task lifecycle (backlog → running → done)
- Tag removal from board-level definitions also removes from all tasks

### What Phase 3 Deliberately Did NOT Include
- **Tags on sessions** — would require session store changes; tags are task-level only
- **Auto-tagging** by folder path or prompt content — YAGNI for now
- **Tag management UI** (rename, reorder, bulk delete) — can manage via task editing
- **Multi-tag filter** (AND/OR logic) — single tag filter is sufficient

### Files Changed/Created
- `src/preload/index.d.ts` — added `TagDefinition`, `tags` on `BoardTask` and `BoardData`
- `src/main/board-manager.ts` — migration for `tags` field
- `src/renderer/src/store/board-store.ts` — tag CRUD, `activeTagFilter`, updated `debouncedSave`
- `src/renderer/src/components/board/TagPill.tsx` — new (reusable color-coded pill)
- `src/renderer/src/components/board/TagInput.tsx` — new (autocomplete input)
- `src/renderer/src/components/board/KanbanCard.tsx` — shows tag pills
- `src/renderer/src/components/board/KanbanBoard.tsx` — tag filter bar
- `src/renderer/src/components/board/TaskDetailPanel.tsx` — tag editing
- `src/renderer/src/components/board/TaskForm.tsx` — tag input on create/edit
```

Move the Phase 4 section down, update open questions.

- [ ] **Step 2: Add Phase 3 section to `docs/features/kanban-board/spec.md`**

Add after the Phase 2 section:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/ideas/kanban-board.md docs/features/kanban-board/spec.md
git commit -m "docs: update kanban docs with Phase 3 tagging system details"
```

---

## Self-Review

**Spec coverage check against `docs/ideas/kanban-board.md` Phase 3 requirements:**
- "Tags on both tasks and sessions" → Tasks: YES (Task 1-8). Sessions: NO — deliberately scoped out. Sessions would require touching `session-store.ts` and `SessionItem.tsx` which is a separate concern. Noted in "What Phase 3 Does NOT Include".
- "Filter board by tag" → YES (Task 8)
- "Color-coded tag pills on cards" → YES (Task 3 + Task 5)
- "Tags persist through the task lifecycle" → YES — tags are on `BoardTask`, survive column moves
- "Could auto-tag based on folder path or prompt content" → NO — spec says "could", this is YAGNI

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" patterns found.

**Type consistency check:**
- `TagDefinition` — defined in Task 1 (preload + board-manager), used in Task 2 (store), Task 4 (TagInput)
- `tags: string[]` on `BoardTask` — added in Task 1, used in Tasks 2, 5, 6, 7, 8
- `TAG_COLOR_MAP` — defined and exported in Task 3 (TagPill), imported in Task 4 (TagInput)
- `boardTags` selector — used consistently as `useBoardStore((s) => s.tags)` in Tasks 5, 7, 8
- `addTag(name, color?)` — defined in Task 2, called in Task 4
- `activeTagFilter` — defined in Task 2, used in Task 8
