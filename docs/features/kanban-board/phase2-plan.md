# Kanban Board Phase 2: Auto-Movement via Session Events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards on the kanban board automatically move between columns and update their visual status based on real-time session state changes (active, idle, permission prompt, ended).

**Architecture:** A React hook (`use-board-session-sync`) subscribes to the session store and auto-transitions board cards when their linked session's `activityStatus` or `promptWaiting` changes. The card component reads live session state for richer status indicators. No new IPC or main-process changes needed — all activity detection already exists in the renderer.

**Tech Stack:** React 19, Zustand 5 (subscribe API), TypeScript, Tailwind CSS v4

**Note:** This project has no test framework. Steps use manual verification via `npm run dev` instead of automated tests. Typecheck with `npx tsc --noEmit`.

---

## Background: How Session Activity Works

The renderer already tracks session state in `session-store.ts`:
- `activityStatus`: `'active' | 'idle' | 'ended'` — set by `use-terminal.ts` based on PTY output patterns
- `promptWaiting`: `string | null` — `'is asking for permission'`, `'is asking a question'`, or `null`
- `alive`: `boolean` — set to `false` on session exit, which also sets `activityStatus: 'ended'`

Detection happens in `use-terminal.ts`:
- After 50ms of sustained PTY output → `active`
- After 2s of silence → `idle`, then checks for prompt patterns
- On session exit → `alive: false`, `activityStatus: 'ended'`

The board store and session store are currently **completely independent** — no cross-store subscriptions exist.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/renderer/src/hooks/use-board-session-sync.ts` | **Create** | Hook that subscribes to session store and auto-moves cards |
| `src/renderer/src/components/board/KanbanCard.tsx` | Modify | Show richer session status (active/idle/permission/ended) |
| `src/renderer/src/components/board/KanbanBoard.tsx` | Modify | Mount the sync hook |
| `docs/ideas/kanban-board.md` | Modify | Update Phase 2 status |
| `docs/features/kanban-board/spec.md` | Modify | Add Phase 2 section |

---

### Task 1: Enrich KanbanCard Session Indicators

The card currently shows binary "Running" / "Session ended". Add granular status: active (working), idle (waiting), asking for permission, asking a question.

**Files:**
- Modify: `src/renderer/src/components/board/KanbanCard.tsx`

- [ ] **Step 1: Read the linked session's activity status and prompt state**

In `KanbanCard.tsx`, the component already subscribes to `useSessionStore` to find `linkedSession`. Extract `activityStatus` and `promptWaiting` from it.

Replace the existing derived state block (lines 51-58):

```typescript
  const sessionAlive = linkedSession?.alive === true
  const activityStatus = linkedSession?.activityStatus ?? null
  const promptWaiting = linkedSession?.promptWaiting ?? null
  const label = task.title || task.notes.split('\n')[0] || task.prompt.split('\n')[0] || 'Untitled'
  const canResume = task.sessionId != null && !sessionAlive
  const canRun =
    column.behavior !== 'terminal' &&
    (column.behavior !== 'active' || canResume)
  const hasPrompt = task.prompt.trim().length > 0
  const notesPreview = task.notes.trim() ? task.notes.split('\n').slice(0, 2).join(' ') : null
```

- [ ] **Step 2: Replace the session indicator section with granular status**

Replace the `{/* Session indicator */}` block (lines 121-149) with:

```tsx
      {/* Session indicator */}
      {task.sessionId && (
        <div className="mt-2 flex items-center gap-1.5">
          {sessionAlive && promptWaiting ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] text-amber-400 truncate">
                {promptWaiting === 'is asking for permission'
                  ? 'Needs permission'
                  : 'Waiting for input'}
              </span>
            </>
          ) : sessionAlive && activityStatus === 'active' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] text-green-400">Working</span>
            </>
          ) : sessionAlive && activityStatus === 'idle' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-[11px] text-blue-400">Idle</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
              <span className="text-[11px] text-text-tertiary">Session ended</span>
            </>
          )}
          {linkedSession && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewSession?.(task.sessionId!)
              }}
              className="ml-auto h-6 px-2 rounded text-[11px] font-medium bg-accent/10 hover:bg-accent/20 text-accent transition-colors flex items-center gap-1"
              title="View session"
            >
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              View
            </button>
          )}
        </div>
      )}
```

Status mapping:
- **Amber pulsing + "Needs permission"** — `promptWaiting === 'is asking for permission'`
- **Amber pulsing + "Waiting for input"** — `promptWaiting === 'is asking a question'`
- **Green pulsing + "Working"** — `activityStatus === 'active'`, no prompt
- **Blue solid + "Idle"** — `activityStatus === 'idle'`, no prompt
- **Gray solid + "Session ended"** — `!alive`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean, no errors

- [ ] **Step 4: Manual verification**

Run `npm run dev`. Create a task, run it. Watch the card status cycle through:
1. "Working" (green pulsing) while Claude outputs text
2. "Idle" (blue solid) when Claude pauses between tool calls
3. "Needs permission" (amber pulsing) when Claude asks to run a tool
4. After granting/denying, back to "Working"

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/board/KanbanCard.tsx
git commit -m "feat(board): show granular session status on cards (active/idle/permission)"
```

---

### Task 2: Create the Session Sync Hook

This hook subscribes to session store changes and auto-moves board cards when their linked session's state changes.

**Files:**
- Create: `src/renderer/src/hooks/use-board-session-sync.ts`

- [ ] **Step 1: Create the hook file**

Create `src/renderer/src/hooks/use-board-session-sync.ts`:

```typescript
import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store/session-store'
import { useBoardStore } from '../store/board-store'
import type { Session } from '../store/session-types'

/**
 * Subscribes to session store changes and auto-moves board cards
 * when their linked session's state transitions.
 *
 * Transitions handled:
 * - Session ends (alive: false) → move card to terminal-behavior column (Done)
 */
export function useBoardSessionSync(): void {
  // Track previous session states to detect transitions
  const prevSessionsRef = useRef<Map<string, { alive: boolean }>>(new Map())

  useEffect(() => {
    // Build initial snapshot
    const sessions = useSessionStore.getState().sessions
    const initial = new Map<string, { alive: boolean }>()
    for (const s of sessions) {
      initial.set(s.id, { alive: s.alive })
    }
    prevSessionsRef.current = initial

    const unsub = useSessionStore.subscribe((state) => {
      const boardState = useBoardStore.getState()
      const prevSessions = prevSessionsRef.current

      // Build a map of sessionId → task for quick lookup
      const tasksBySessionId = new Map<string, (typeof boardState.tasks)[number]>()
      for (const task of boardState.tasks) {
        if (task.sessionId) {
          tasksBySessionId.set(task.sessionId, task)
        }
      }

      for (const session of state.sessions) {
        const prev = prevSessions.get(session.id)
        const task = tasksBySessionId.get(session.id)
        if (!task) continue

        // Transition: alive → dead → move to terminal column
        if (prev?.alive === true && session.alive === false) {
          const terminalCol = boardState.getColumnByBehavior('terminal')
          if (terminalCol && task.columnId !== terminalCol.id) {
            useBoardStore.getState().moveTask(task.id, terminalCol.id, 0)
          }
        }
      }

      // Update snapshot
      const next = new Map<string, { alive: boolean }>()
      for (const s of state.sessions) {
        next.set(s.id, { alive: s.alive })
      }
      prevSessionsRef.current = next
    })

    return unsub
  }, [])
}
```

Key design decisions:
- **Only auto-moves on session end** (alive: true → false). Other transitions (active/idle/permission) are visual-only on the card — moving cards on every idle/active flicker would be chaotic.
- **Uses a ref to track previous state** so we detect transitions (not just current state). Without this, reopening the board would re-trigger moves for already-ended sessions.
- **Graceful degradation**: if no terminal column exists, card stays in place.
- **Reads board state at transition time** (not in the subscription callback's closure) to avoid stale data.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean, no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/use-board-session-sync.ts
git commit -m "feat(board): add session sync hook for auto-moving cards on session end"
```

---

### Task 3: Mount the Sync Hook in KanbanBoard

Wire the hook into the board component so it starts listening when the board is mounted.

**Files:**
- Modify: `src/renderer/src/components/board/KanbanBoard.tsx`

- [ ] **Step 1: Import and mount the hook**

Add import at the top of `KanbanBoard.tsx`, after the existing hook imports:

```typescript
import { useBoardSessionSync } from '../../hooks/use-board-session-sync'
```

Then call it inside the `TaskQueue` component, right after `useBoardPersistence()`:

```typescript
  useBoardPersistence()
  useBoardSessionSync()
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean, no errors

- [ ] **Step 3: Manual verification — auto-move to Done**

Run `npm run dev`. Test the full flow:
1. Create a task with a simple prompt (e.g., "What is 2+2?")
2. Run the task — card moves to Running column, shows "Working"
3. Wait for Claude to finish and the session to end
4. Card should **automatically move to Done column** without user interaction
5. Card should show "Session ended" with Resume button

- [ ] **Step 4: Manual verification — edge cases**

Test these scenarios:
1. **No Done column**: Delete the Done column, run a task, let it end. Card should stay in Running (graceful degradation).
2. **Card already in Done**: If a card is manually in Done with a sessionId, ending that session should not cause errors.
3. **App restart**: Restart the dev app. Cards that were already in their correct columns should not re-trigger moves.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/board/KanbanBoard.tsx
git commit -m "feat(board): mount session sync hook for auto-move on session end"
```

---

### Task 4: Add Permission Attention Border to Card

When a session is asking for permission, the card should visually stand out even without hovering — add an amber border highlight.

**Files:**
- Modify: `src/renderer/src/components/board/KanbanCard.tsx`

- [ ] **Step 1: Add attention styling to the card container**

In `KanbanCard.tsx`, update the outer `div`'s `className` to add an amber ring when the session needs attention:

```tsx
      className={cn(
        'group rounded-lg border border-border-subtle bg-surface-100 p-3 cursor-default transition-all hover:border-border hover:shadow-sm',
        isDragging && 'opacity-40',
        sessionAlive && promptWaiting && 'border-amber-400/50 shadow-[0_0_8px_rgba(251,191,36,0.15)]'
      )}
```

This gives cards with pending prompts an amber glow that's visible at a glance across the board without needing to read the status text.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean, no errors

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Run a task. When Claude asks for permission (e.g., to create a file), the card in the Running column should have a visible amber border/glow. After granting permission, it should return to normal styling.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/board/KanbanCard.tsx
git commit -m "feat(board): add amber attention border when session needs permission"
```

---

### Task 5: Update Documentation

**Files:**
- Modify: `docs/ideas/kanban-board.md`
- Modify: `docs/features/kanban-board/spec.md`

- [ ] **Step 1: Update the ideas doc**

In `docs/ideas/kanban-board.md`, change the status line from:

```
**Status:** Phase 1 Complete (2026-04-04), Phase 2 Planned
```

to:

```
**Status:** Phase 2 Complete (2026-04-0X)
```

Update the Phase 2 section to mark it as completed, listing what was built:
- Session-aware card indicators: Working (green), Idle (blue), Needs permission (amber), Waiting for input (amber), Session ended (gray)
- Amber attention border/glow on cards when session needs permission
- Auto-move to Done column when session ends
- `use-board-session-sync.ts` hook subscribing to session store
- Graceful degradation when terminal column doesn't exist

- [ ] **Step 2: Update the spec**

In `docs/features/kanban-board/spec.md`, add a Phase 2 section after the Phase 1 content documenting:
- The sync hook architecture
- Card status states and their visual treatment
- Auto-move transitions implemented
- What was NOT included (auto-move on idle, configurable transitions)

- [ ] **Step 3: Commit**

```bash
git add docs/ideas/kanban-board.md docs/features/kanban-board/spec.md
git commit -m "docs: update kanban docs for Phase 2 completion"
```

---

## Self-Review

**Spec coverage check** (against `docs/ideas/kanban-board.md` Phase 2):
- ✅ Task run → card moves to "Running" — already done in Phase 1
- ❌ Session goes idle → card moves to "Review" — **deliberately skipped**: Claude flickers between active/idle many times per task. Moving cards on each transition would be chaotic and useless. Instead, idle is shown as a visual indicator on the card.
- ✅ Session asks for permission → card shows indicator — amber pulsing "Needs permission" + amber border glow
- ✅ Session ends → card moves to "Done" — auto-move via sync hook
- ❌ Session errors → card moves to "Needs Attention" — no separate error state exists in the session store (`activityStatus` is just `ended` for both normal and error exits). Could be added in a future phase if error detection is added to `use-terminal.ts`.

**Placeholder scan:** No TBD, TODO, or vague steps found.

**Type consistency:** `activityStatus`, `promptWaiting`, `alive`, `sessionId` — all match existing types in `session-types.ts` and `preload/index.d.ts`.
