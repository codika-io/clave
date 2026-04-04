# Kanban Board Phase 4: History Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link kanban board tasks to their Claude Code session history so users can see what a task actually did, browse the conversation, and resume tasks even after an app restart.

**Architecture:** The core problem is that `BoardTask.sessionId` points to a transient Clave runtime session ID (lost on restart), not to Claude's persistent session UUID. We add `claudeSessionId` to `BoardTask` (persisted to `board.json`), which survives restarts and directly maps to `ClaudeHistorySession.sessionId`. This enables: (1) showing history summary on completed cards, (2) browsing the full conversation from a card, (3) resuming from cold start without the runtime session in memory.

**Tech Stack:** React 19, Zustand 5, Tailwind CSS v4, TypeScript, Electron IPC

---

## The `sessionId` Mapping Problem

| Field | Where | Persistent? | What it is |
|---|---|---|---|
| `BoardTask.sessionId` | `board.json` | Yes | Clave's runtime session UUID — only valid while app is running |
| `Session.claudeSessionId` | session-store (memory) | No | Claude's persistent UUID — used for `claude --resume` and JSONL filenames |
| `ClaudeHistorySession.sessionId` | `~/.claude/projects/` | Yes | Same Claude UUID — what `historyLoadSessions` returns |

After restart, `BoardTask.sessionId` exists but the `Session` object is gone from memory. We can't recover `claudeSessionId` without it. **Fix:** persist `claudeSessionId` directly on the board task.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/preload/index.d.ts` | Modify | Add `claudeSessionId` to `BoardTask` |
| `src/main/board-manager.ts` | Modify | Migration: default `claudeSessionId` to undefined |
| `src/renderer/src/store/board-store.ts` | Modify | Add `claudeSessionId` to `updateTask` type |
| `src/renderer/src/components/board/KanbanBoard.tsx` | Modify | Store `claudeSessionId` on task during `runTask`, enable cold-start resume |
| `src/renderer/src/components/board/TaskDetailPanel.tsx` | Modify | Show history summary, "Browse History" button, cold-start resume |
| `src/renderer/src/components/board/TaskHistorySection.tsx` | Create | History summary display component (messages, summary, timestamps) |
| `src/renderer/src/components/board/KanbanCard.tsx` | Modify | Show summary snippet on completed cards, cold-start resume |

---

### Task 1: Persist `claudeSessionId` on Board Tasks

**Files:**
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/board-manager.ts`
- Modify: `src/renderer/src/store/board-store.ts`
- Modify: `src/renderer/src/components/board/KanbanBoard.tsx`

This is the foundational change. Once `claudeSessionId` is on the task, everything else follows.

- [ ] **Step 1: Add `claudeSessionId` to `BoardTask` in preload types**

In `src/preload/index.d.ts`, in the `BoardTask` interface, add after `sessionId?: string`:

```typescript
  claudeSessionId?: string   // Claude's persistent session UUID — survives app restart
```

- [ ] **Step 2: Add `claudeSessionId` to `BoardTask` in board-manager.ts**

In `src/main/board-manager.ts`, in the `BoardTask` interface, add after `sessionId?: string`:

```typescript
  claudeSessionId?: string
```

In the `load()` method's task migration `.map()`, add:

```typescript
claudeSessionId: (t.claudeSessionId as string) ?? undefined
```

- [ ] **Step 3: Add `claudeSessionId` to `updateTask` type in board-store.ts**

In `src/renderer/src/store/board-store.ts`, update the `updateTask` method's `Pick` type to include `claudeSessionId`:

```typescript
  updateTask: (
    id: string,
    updates: Partial<
      Pick<BoardTask, 'title' | 'prompt' | 'notes' | 'cwd' | 'dangerousMode' | 'sessionId' | 'tags' | 'claudeSessionId'>
    >
  ) => void
```

- [ ] **Step 4: Store `claudeSessionId` on task during `runTask` in KanbanBoard.tsx**

In `src/renderer/src/components/board/KanbanBoard.tsx`, in the `runTask` callback, there are two places where `updateTask(task.id, { sessionId: sessionInfo.id })` is called (line ~168 for resume, line ~205 for fresh run). Update both to also store `claudeSessionId`:

For the resume path (around line 168):
```typescript
        updateTask(task.id, { sessionId: sessionInfo.id, claudeSessionId: sessionInfo.claudeSessionId ?? undefined })
```

For the fresh run path (around line 205):
```typescript
      updateTask(task.id, { sessionId: sessionInfo.id, claudeSessionId: sessionInfo.claudeSessionId ?? undefined })
```

- [ ] **Step 5: Enable cold-start resume using `claudeSessionId`**

Still in `KanbanBoard.tsx`, the current resume logic at the top of `runTask` checks:
```typescript
const existingSession = task.sessionId
  ? useSessionStore.getState().sessions.find((s) => s.id === task.sessionId)
  : undefined
const canResume = existingSession && !existingSession.alive && existingSession.claudeSessionId
```

After app restart, `existingSession` is `undefined` because the runtime session is gone. Add a fallback that uses the persisted `claudeSessionId`:

Replace the resume check block with:
```typescript
      // Check if this task has an ended session we can resume
      const existingSession = task.sessionId
        ? useSessionStore.getState().sessions.find((s) => s.id === task.sessionId)
        : undefined
      const canResumeFromSession = existingSession && !existingSession.alive && existingSession.claudeSessionId
      
      // Cold-start fallback: use persisted claudeSessionId when runtime session is gone
      const resumeId = canResumeFromSession
        ? existingSession.claudeSessionId!
        : (!existingSession && task.claudeSessionId)
          ? task.claudeSessionId
          : null

      if (resumeId) {
        // Resume the previous Claude session
        const sessionInfo = await window.electronAPI.spawnSession(task.cwd, {
          claudeMode: true,
          resumeSessionId: resumeId
        })

        addSession({
          id: sessionInfo.id,
          cwd: sessionInfo.cwd,
          folderName: sessionInfo.folderName,
          name: task.title || task.prompt.slice(0, 40),
          alive: sessionInfo.alive,
          activityStatus: 'idle',
          promptWaiting: null,
          claudeMode: true,
          dangerousMode: task.dangerousMode ?? false,
          claudeSessionId: sessionInfo.claudeSessionId,
          sessionType: 'local'
        })

        const activeCol = getColumnByBehavior('active')
        if (activeCol) {
          moveTask(task.id, activeCol.id, 0)
        }
        updateTask(task.id, { sessionId: sessionInfo.id, claudeSessionId: sessionInfo.claudeSessionId ?? undefined })

        useSessionStore.getState().selectSession(sessionInfo.id, false)
        return
      }
```

- [ ] **Step 6: Update `canResume` logic in KanbanCard.tsx**

In `src/renderer/src/components/board/KanbanCard.tsx`, the current `canResume` logic (around line 67):
```typescript
const canResume = linkedSession != null && !sessionAlive
```

Update to also consider cold-start resume via `claudeSessionId`:
```typescript
const canResume = (linkedSession != null && !sessionAlive) || (!linkedSession && !!task.claudeSessionId)
```

Also update `canRun` (around line 68-70) — a task with `claudeSessionId` but no runtime session should show "Resume", not "Run". The current `canRun` condition works because `!sessionAlive` is `true` when there's no session. But the button text logic already handles this: `canResume ? 'Resume' : 'Run'`. So the button label will correctly show "Resume" after the `canResume` change above.

- [ ] **Step 7: Update `canResume` in TaskDetailPanel.tsx**

In `src/renderer/src/components/board/TaskDetailPanel.tsx`, same change (around line 33):

```typescript
const canResume = (linkedSession != null && !sessionAlive) || (!linkedSession && !!task?.claudeSessionId)
```

- [ ] **Step 8: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/preload/index.d.ts src/main/board-manager.ts src/renderer/src/store/board-store.ts src/renderer/src/components/board/KanbanBoard.tsx src/renderer/src/components/board/KanbanCard.tsx src/renderer/src/components/board/TaskDetailPanel.tsx
git commit -m "feat(board): persist claudeSessionId on tasks, enable cold-start resume"
```

---

### Task 2: History Summary Section Component

**Files:**
- Create: `src/renderer/src/components/board/TaskHistorySection.tsx`

This component fetches and displays history data for a task that has a `claudeSessionId`. It's used inside the TaskDetailPanel.

- [ ] **Step 1: Create the `TaskHistorySection` component**

Create `src/renderer/src/components/board/TaskHistorySection.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react'
import { ClockIcon, ChatBubbleLeftRightIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { useHistoryStore, type HistorySession } from '../../store/history-store'

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDuration(startStr: string, endStr: string): string {
  const start = new Date(startStr).getTime()
  const end = new Date(endStr).getTime()
  const diffMin = Math.floor((end - start) / 60000)
  if (diffMin < 1) return '<1m'
  if (diffMin < 60) return `${diffMin}m`
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

interface TaskHistorySectionProps {
  claudeSessionId: string
  onBrowseHistory: (session: HistorySession) => void
}

export function TaskHistorySection({ claudeSessionId, onBrowseHistory }: TaskHistorySectionProps) {
  const sessionsByProject = useHistoryStore((s) => s.sessionsByProject)
  const refresh = useHistoryStore((s) => s.refresh)
  const [loading, setLoading] = useState(false)
  const [refreshed, setRefreshed] = useState(false)

  // Find the matching history session by claudeSessionId
  const historySession = useMemo(() => {
    for (const sessions of Object.values(sessionsByProject)) {
      const match = sessions.find((s) => s.sessionId === claudeSessionId)
      if (match) return match
    }
    return null
  }, [sessionsByProject, claudeSessionId])

  // Auto-refresh history if not loaded yet
  useEffect(() => {
    if (!historySession && !refreshed && !loading) {
      setLoading(true)
      setRefreshed(true)
      refresh().finally(() => setLoading(false))
    }
  }, [historySession, refreshed, loading, refresh])

  if (loading) {
    return (
      <div className="text-xs text-text-tertiary py-2">
        Loading history...
      </div>
    )
  }

  if (!historySession) {
    return (
      <div className="text-xs text-text-tertiary py-2">
        Session history not found
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Summary */}
      {historySession.summary && (
        <p className="text-xs text-text-secondary line-clamp-3">
          {historySession.summary}
        </p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1">
          <ChatBubbleLeftRightIcon className="w-3 h-3" />
          {historySession.messageCount} messages
        </span>
        <span className="flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          {formatDuration(historySession.createdAt, historySession.lastModified)}
        </span>
        <span>{formatRelativeDate(historySession.lastModified)}</span>
      </div>

      {/* Browse button */}
      <button
        onClick={() => onBrowseHistory(historySession)}
        className="h-6 px-2.5 rounded text-[11px] font-medium bg-accent/10 hover:bg-accent/20 text-accent transition-colors flex items-center gap-1"
      >
        <ArrowTopRightOnSquareIcon className="w-3 h-3" />
        Browse History
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/board/TaskHistorySection.tsx
git commit -m "feat(board): add TaskHistorySection component for history display"
```

---

### Task 3: Wire History Section into TaskDetailPanel

**Files:**
- Modify: `src/renderer/src/components/board/TaskDetailPanel.tsx`

- [ ] **Step 1: Import dependencies**

Add imports at the top of `TaskDetailPanel.tsx`:

```typescript
import { TaskHistorySection } from './TaskHistorySection'
import { useHistoryStore } from '../../store/history-store'
```

- [ ] **Step 2: Add `onBrowseHistory` handler**

Inside the `TaskDetailPanel` component, add a handler that navigates to the history panel with the linked session selected:

```typescript
  const selectHistorySession = useHistoryStore((s) => s.selectSession)

  const handleBrowseHistory = useCallback(
    (historySession: import('../../store/history-store').HistorySession) => {
      save()
      onClose()
      selectHistorySession(historySession)
    },
    [save, onClose, selectHistorySession]
  )
```

- [ ] **Step 3: Add the history section to the panel UI**

In the JSX, after the session status & actions section (the `{task.sessionId && (` block) and before the metadata section, add:

```tsx
                {/* History */}
                {task.claudeSessionId && (
                  <div className="pt-3 border-t border-border-subtle">
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      History
                    </label>
                    <TaskHistorySection
                      claudeSessionId={task.claudeSessionId}
                      onBrowseHistory={handleBrowseHistory}
                    />
                  </div>
                )}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/board/TaskDetailPanel.tsx
git commit -m "feat(board): show history summary and browse button in task detail panel"
```

---

### Task 4: History Summary on Completed Cards

**Files:**
- Modify: `src/renderer/src/components/board/KanbanCard.tsx`

Show a brief history summary on cards in terminal-behavior columns (Done) that have a `claudeSessionId`.

- [ ] **Step 1: Import history store**

Add import in `KanbanCard.tsx`:

```typescript
import { useHistoryStore } from '../../store/history-store'
```

- [ ] **Step 2: Look up history session for completed tasks**

Inside the `KanbanCard` component, add a selector that only fires for cards with `claudeSessionId`:

```typescript
  const historySession = useHistoryStore((s) => {
    if (!task.claudeSessionId) return null
    for (const sessions of Object.values(s.sessionsByProject)) {
      const match = sessions.find((sess) => sess.sessionId === task.claudeSessionId)
      if (match) return match
    }
    return null
  })
```

- [ ] **Step 3: Add history summary snippet on cards**

Add after the session indicator section (after the `{task.sessionId && (` block's closing `)}`, around line 178), before the closing `</div>` of the card:

```tsx
      {/* History summary for completed tasks */}
      {!sessionAlive && task.claudeSessionId && historySession && (
        <div className="mt-2 pt-2 border-t border-border-subtle">
          <p className="text-[11px] text-text-tertiary line-clamp-2">
            {historySession.summary || 'No summary available'}
          </p>
          <span className="text-[10px] text-text-tertiary">
            {historySession.messageCount} messages
          </span>
        </div>
      )}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Verify the app builds**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npx electron-vite build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/board/KanbanCard.tsx
git commit -m "feat(board): show history summary on completed task cards"
```

---

### Task 5: Update Docs

**Files:**
- Modify: `docs/ideas/kanban-board.md`
- Modify: `docs/features/kanban-board/spec.md`

- [ ] **Step 1: Update `docs/ideas/kanban-board.md`**

Replace the Phase 4 "What's Next" section with a completed Phase 4 section:

```markdown
## What's Been Built (Phase 4) -- Completed 2026-04-04

### History Integration
- **`claudeSessionId` persisted on board tasks** — survives app restart
- **Cold-start resume** — tasks can be resumed after app restart without runtime session in memory
- **History summary on completed cards** — shows session summary, message count, and duration
- **"Browse History" button** in task detail panel — navigates to HistoryPanel with the linked session
- **TaskHistorySection component** — fetches and displays history data from `~/.claude/projects/`

### How the Session ID Chain Works
- `BoardTask.sessionId` → Clave runtime session (transient, lost on restart)
- `BoardTask.claudeSessionId` → Claude's persistent UUID (survives restart)
- `ClaudeHistorySession.sessionId` → Same UUID in `~/.claude/projects/` JSONL files
- Resume uses `claudeSessionId` directly: `claude --resume <uuid>`

### What Phase 4 Deliberately Did NOT Include
- **Inline conversation viewer** — Browse History navigates to the existing HistoryPanel instead of duplicating it
- **History search from board** — users can use the existing history search
- **Auto-linking existing tasks** — only tasks run after Phase 4 get `claudeSessionId`; historical tasks would need manual re-linking
- **Conversation summary extraction** — uses `ClaudeHistorySession.summary` as-is; no LLM-powered summarization

### Files Changed/Created
- `src/preload/index.d.ts` — added `claudeSessionId` to `BoardTask`
- `src/main/board-manager.ts` — migration for `claudeSessionId`
- `src/renderer/src/store/board-store.ts` — `claudeSessionId` in `updateTask` type
- `src/renderer/src/components/board/KanbanBoard.tsx` — stores `claudeSessionId`, cold-start resume
- `src/renderer/src/components/board/KanbanCard.tsx` — history summary on completed cards, cold-start resume
- `src/renderer/src/components/board/TaskDetailPanel.tsx` — history section, Browse History button
- `src/renderer/src/components/board/TaskHistorySection.tsx` — new (history display component)
```

- [ ] **Step 2: Add Phase 4 section to `docs/features/kanban-board/spec.md`**

Add after the Phase 3 section, before "Upstream Contribution Notes":

```markdown
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
2. Searches `historyStore.sessionsByProject` for matching `ClaudeHistorySession.sessionId`
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/ideas/kanban-board.md docs/features/kanban-board/spec.md
git commit -m "docs: update kanban docs with Phase 4 history integration details"
```

---

## Self-Review

**Spec coverage check against `docs/ideas/kanban-board.md` Phase 4 requirements:**
- "Completed tasks should link to their Claude Code session history" → YES (Task 1: `claudeSessionId` persistence)
- "kanban 'Done' column could reference these" → YES (Task 4: history summary on cards)
- "Enables: 'what did this task actually do?' review workflow" → YES (Task 2+3: TaskHistorySection with summary, messages, duration, Browse History button)
- "Could pull conversation summaries from history into the card" → YES (Task 4: shows `historySession.summary` on cards)

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" patterns found.

**Type consistency check:**
- `claudeSessionId?: string` — defined on `BoardTask` in Task 1, used in Tasks 2, 3, 4
- `TaskHistorySection` — created in Task 2, imported in Task 3
- `HistorySession` — imported from `history-store` in Tasks 2, 3
- `onBrowseHistory` — defined in Task 2's props, wired in Task 3
- `historySession.summary`, `historySession.messageCount`, `historySession.createdAt`, `historySession.lastModified` — all fields exist on `HistorySession` type from `history-store.ts`
