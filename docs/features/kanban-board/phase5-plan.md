# Phase 5: Universal Session Tracking

**Status:** COMPLETED (2026-04-04)

## Goal

Make the kanban board the single source of truth for all Claude work. Every Claude-mode session automatically gets a board card — not just tasks started from the kanban.

## Problem

Currently, only sessions started via "Run" on a kanban task get a board card. Sessions started from:
- Sidebar "New Session" button
- History panel "Restore"
- Duplicating a session
- Pinned groups / launch templates
- AppShell menu with explicit Claude mode

...all bypass the board entirely. This means the board only shows a subset of work.

## Design

### What gets a card

**Only Claude-mode local sessions.** Specifically:
- `claudeMode: true` AND `sessionType: 'local'`

**Excluded:**
- Terminal sessions (`claudeMode: false`) — not Claude work
- Remote sessions (`sessionType: 'remote-claude'`) — different workflow, managed via SSH panel
- Group terminal sessions (always `claudeMode: false`)
- Toolbar quick actions (always `claudeMode: false`)

### Where cards land

New auto-created cards go to the **active-behavior column** (Running). This column becomes **locked** (`locked: true`) — it cannot be deleted since it's the landing spot for all sessions.

### How it works

**Single hook point:** Instead of modifying every session creation call site (11+ places), subscribe to the session store and detect new Claude-mode sessions. When a new session appears that has no linked board task, auto-create one.

This is the same pattern as `use-board-session-sync.ts` (Phase 2), which watches for session *end* events. Phase 5 adds a complementary hook that watches for session *start* events.

### Card auto-creation details

When a new Claude-mode session is detected without a linked board task:

| Field | Value |
|---|---|
| `title` | Session name (from `session.name`) |
| `prompt` | Empty (session is already running) |
| `notes` | Empty |
| `cwd` | `session.cwd` |
| `dangerousMode` | `session.dangerousMode` |
| `tags` | `[]` |
| `columnId` | Active-behavior column |
| `sessionId` | The new session's runtime ID |
| `claudeSessionId` | `session.claudeSessionId` |

### Deduplication

The hook must NOT create a card if:
1. A board task already has `sessionId === newSession.id` (kanban-started sessions)
2. The session is not Claude-mode (`claudeMode !== true`)
3. The session is remote (`sessionType !== 'local'`)

### Active column protection

The active-behavior column gets `locked: true` in the default columns. This means:
- It cannot be deleted (delete button disabled/hidden)
- It can still be renamed and reordered
- The existing `deleteColumn` logic already checks `column.locked` and returns early

Migration: existing boards need the Running column updated to `locked: true`.

### History resume integration

When a session is resumed from the History panel, the auto-created card will have:
- `claudeSessionId` from the spawned session (which equals the history session's UUID)
- This means the card will show history summary and "Browse History" button (Phase 4 features) automatically

## Session Creation Call Sites

| # | Source | Claude? | Gets card? | Notes |
|---|---|---|---|---|
| 1 | NewSessionButton | Global setting | If claude | Most common manual creation |
| 2 | Sidebar handleNewSession | Global setting | If claude | Same as #1 |
| 3 | Sidebar remote session | Parameterized | No | Remote sessions excluded |
| 4 | Sidebar group terminal | Always false | No | Terminal only |
| 5 | Sidebar duplicate | Copies original | If claude | Duplicates get their own card |
| 6 | AppShell spawnWithOptions | Explicit param | If claude | Menu-driven |
| 7 | AppShell toolbar quick action | Always false | No | Terminal only |
| 8 | HistoryPanel restore | Always true | Yes | Resume from history |
| 9 | KanbanBoard runTask | Always true | Already has one | Skip — already tracked |
| 10 | pinned-store spawn | Per-pin | No | Skip — app startup noise |
| 11 | use-launch-template | Per-template | No | Skip — app startup noise |

## Files to Change

| File | Change |
|---|---|
| `src/renderer/src/hooks/use-board-session-sync.ts` | Add session-start detection alongside existing session-end detection |
| `src/renderer/src/store/board-store.ts` | Add `addTaskForSession` method that creates a minimal task linked to a session |
| `src/main/board-manager.ts` | Migration: set `locked: true` on the active-behavior column |
| `src/renderer/src/components/board/KanbanColumn.tsx` | Respect `locked` flag — hide delete in context menu |

## What Phase 5 Does NOT Include

- **Retroactive card creation** — existing sessions don't get cards; only new ones going forward
- **Terminal session tracking** — only Claude-mode sessions
- **Remote session tracking** — remote sessions have their own workflow
- **Session grouping on cards** — if a user runs multiple sessions for one task, each gets its own card
- **Merging duplicate cards** — if the same cwd spawns multiple sessions, each is independent

## Resolved Questions

- **Pinned group / template sessions on startup?** No — skip sites #10 and #11. Only user-initiated sessions get cards. This avoids a burst of cards on every app launch.
- **Auto-update card title from session auto-title?** No — keep it simple. Card title is set once at creation from `session.name`. Title sync is a future improvement.
