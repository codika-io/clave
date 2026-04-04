# Kanban Phase 5: Universal Session Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-create kanban board cards for all Claude-mode sessions, making the board the single source of truth for all Claude work.

**Architecture:** Extend the existing `use-board-session-sync` hook to detect new sessions (not just session-end transitions). When a Claude-mode local session appears that has no linked board task, auto-create a task in the active-behavior column. The active column becomes locked to prevent deletion. Startup sessions (templates, pinned groups) are skipped via the same snapshot-diff pattern already used for session-end detection.

**Tech Stack:** React 19, Zustand 5, TypeScript

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/renderer/src/hooks/use-board-session-sync.ts` | Modify | Add new-session detection alongside existing session-end detection |
| `src/main/board-manager.ts` | Modify | Migration: set `locked: true` on the active-behavior column |
| `src/renderer/src/components/board/KanbanColumn.tsx` | No change needed | Already checks `column.locked` for delete (line 67) |

That's it — only 2 files need changes. The column UI already respects `locked`. The board store's `addTask` and `deleteColumn` already handle `locked` columns.

---

### Task 1: Lock the Active Column

**Files:**
- Modify: `src/main/board-manager.ts:36-49`

The default columns are created in `createDefaultColumns()`. Currently the Running column has no `locked` flag. Add it so the active-behavior column can't be deleted.

- [ ] **Step 1: Update `createDefaultColumns` to lock the Running column**

In `src/main/board-manager.ts`, in the `createDefaultColumns()` function, update the Running column entry (line 46):

```typescript
// Old:
{ id: crypto.randomUUID(), title: 'Running', order: 2, builtIn: true, behavior: 'active' },

// New:
{ id: crypto.randomUUID(), title: 'Running', order: 2, builtIn: true, behavior: 'active', locked: true },
```

- [ ] **Step 2: Add migration for existing boards**

In the `load()` method, after the columns are parsed (after `let columns: BoardColumn[]` block around line 66-69), add a migration that locks the active-behavior column if it isn't already:

```typescript
      // Migration: lock the active-behavior column
      columns = columns.map((c) =>
        c.behavior === 'active' && !c.locked ? { ...c, locked: true } : c
      )
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/board-manager.ts
git commit -m "feat(board): lock active-behavior column to prevent deletion"
```

---

### Task 2: Auto-Create Board Tasks for New Sessions

**Files:**
- Modify: `src/renderer/src/hooks/use-board-session-sync.ts`

Extend the existing session sync hook. Currently it:
1. Builds an initial snapshot of session IDs + alive state
2. On each store update, detects `alive: true → false` transitions
3. Moves the linked board task to the terminal column

We add a complementary detection: sessions that appear in the new state but not in the previous snapshot (new sessions). For each new Claude-mode local session without a linked board task, create a card in the active column.

- [ ] **Step 1: Update the snapshot type to include more session data**

Change the `prevSessionsRef` type from tracking just `{ alive: boolean }` to tracking the full set of session IDs. We need to know which sessions are new (not in previous snapshot) vs. which sessions changed state.

Replace the entire file content with:

```typescript
import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store/session-store'
import { useBoardStore } from '../store/board-store'
import type { Session } from '../store/session-types'

/**
 * Subscribes to session store changes and syncs with the board:
 *
 * 1. Session ends (alive: true → false) → move card to terminal-behavior column
 * 2. New Claude-mode session appears → auto-create a board card in active column
 *
 * Startup sessions (templates, pinned groups) are skipped because they exist
 * in the initial snapshot — only sessions appearing AFTER init trigger card creation.
 */
export function useBoardSessionSync(): void {
  const prevSessionIdsRef = useRef<Set<string>>(new Set())
  const prevAliveRef = useRef<Map<string, boolean>>(new Map())

  useEffect(() => {
    // Build initial snapshot — these are startup sessions, skip them
    const sessions = useSessionStore.getState().sessions
    const initialIds = new Set<string>()
    const initialAlive = new Map<string, boolean>()
    for (const s of sessions) {
      initialIds.add(s.id)
      initialAlive.set(s.id, s.alive)
    }
    prevSessionIdsRef.current = initialIds
    prevAliveRef.current = initialAlive

    const unsub = useSessionStore.subscribe((state) => {
      const boardState = useBoardStore.getState()
      if (!boardState.loaded) return

      const prevIds = prevSessionIdsRef.current
      const prevAlive = prevAliveRef.current

      // Build a set of session IDs already linked to board tasks
      const linkedSessionIds = new Set<string>()
      for (const task of boardState.tasks) {
        if (task.sessionId) linkedSessionIds.add(task.sessionId)
      }

      for (const session of state.sessions) {
        // --- New session detection ---
        if (!prevIds.has(session.id)) {
          // This is a brand new session. Auto-create a board task if:
          // 1. It's a Claude-mode local session
          // 2. No board task already links to it (kanban-started sessions set sessionId before addSession)
          if (
            session.claudeMode &&
            session.sessionType === 'local' &&
            !linkedSessionIds.has(session.id)
          ) {
            const activeCol = boardState.getColumnByBehavior('active')
            if (activeCol) {
              useBoardStore.getState().addTask({
                title: session.name || session.folderName,
                prompt: '',
                notes: '',
                cwd: session.cwd,
                dangerousMode: session.dangerousMode,
                tags: [],
                sessionId: session.id,
                claudeSessionId: session.claudeSessionId ?? undefined,
                columnId: activeCol.id
              })
            }
          }
        }

        // --- Session end detection ---
        const wasAlive = prevAlive.get(session.id)
        if (wasAlive === true && session.alive === false) {
          // Re-read board state since addTask above may have changed it
          const currentBoardState = useBoardStore.getState()
          const task = currentBoardState.tasks.find((t) => t.sessionId === session.id)
          if (task) {
            const terminalCol = currentBoardState.getColumnByBehavior('terminal')
            if (terminalCol && task.columnId !== terminalCol.id) {
              useBoardStore.getState().moveTask(task.id, terminalCol.id, 0)
            }
          }
        }
      }

      // Update snapshots
      const nextIds = new Set<string>()
      const nextAlive = new Map<string, boolean>()
      for (const s of state.sessions) {
        nextIds.add(s.id)
        nextAlive.set(s.id, s.alive)
      }
      prevSessionIdsRef.current = nextIds
      prevAliveRef.current = nextAlive
    })

    return unsub
  }, [])
}
```

Key design decisions in this implementation:
- **Startup skip:** Sessions in the initial snapshot are treated as pre-existing. Only sessions appearing after init get cards. This naturally skips template/pinned sessions that spawn during app startup.
- **Deduplication:** `linkedSessionIds` check prevents double-creating cards for kanban-started sessions (which call `updateTask({ sessionId })` before `addSession`).
- **Re-read board state:** After potentially adding a task, re-read `useBoardStore.getState()` for the session-end check so the new task is found.
- **Board loaded guard:** Skip processing if the board hasn't loaded yet (`!boardState.loaded`) to avoid creating tasks before columns exist.

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npm run typecheck`

Expected: PASS (the `Session` import may generate a warning if unused — remove it if so; it's only used for clarity in the comment).

- [ ] **Step 3: Build the app**

Run: `cd /Users/amirelion/Documents/Development/clave-fork && npx electron-vite build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/use-board-session-sync.ts
git commit -m "feat(board): auto-create board cards for new Claude-mode sessions"
```

---

### Task 3: Update Docs

**Files:**
- Modify: `docs/ideas/kanban-board.md`
- Modify: `docs/features/kanban-board/spec.md`

- [ ] **Step 1: Update `docs/ideas/kanban-board.md`**

Replace the Phase 5 "What's Next" section with a completed Phase 5 section.

- [ ] **Step 2: Update `docs/features/kanban-board/spec.md`**

Change the Phase 5 status from PLANNED to COMPLETED, and add implementation details.

- [ ] **Step 3: Docs are gitignored, so no commit needed**

---

## Self-Review

**Spec coverage (against `docs/features/kanban-board/phase5-plan.md`):**
- "Every Claude-mode session automatically gets a board card" → YES (Task 2: new-session detection in hook)
- "Sessions started from sidebar, history resume, etc." → YES (hook catches all `addSession` calls regardless of source)
- "Active column becomes locked" → YES (Task 1: migration + default columns)
- "Skip pinned groups and templates" → YES (initial snapshot pattern skips startup sessions)
- "Only Claude-mode local sessions" → YES (`session.claudeMode && session.sessionType === 'local'`)
- "Deduplication" → YES (`linkedSessionIds` check)

**Placeholder scan:** No TBDs or placeholders found.

**Type consistency:**
- `Session` type from `session-types.ts` has: `id`, `claudeMode`, `sessionType`, `cwd`, `name`, `folderName`, `dangerousMode`, `claudeSessionId`, `alive` — all used correctly
- `addTask` accepts `Omit<BoardTask, 'id' | 'createdAt' | 'updatedAt' | 'columnId' | 'order'> & { columnId?: string }` — the call in Task 2 provides: `title`, `prompt`, `notes`, `cwd`, `dangerousMode`, `tags`, `sessionId`, `claudeSessionId`, `columnId` — all valid fields
