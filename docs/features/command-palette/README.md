# Command Palette (Cmd+K)

**Status:** Idea — not yet designed or planned

## Summary

A universal search/action bar for discovering and executing any action in Clave. The single most impactful discoverability feature for power users.

## What It Searches

- **Actions** — "New session", "New dangerous session", "Open board", "Toggle sidebar", "Open settings", "Pin current group"
- **Sessions** — Jump to any open session by name (replaces/supplements Cmd+1-9)
- **Board tasks** — Find and open any kanban task
- **Recent history** — Search past Claude sessions by title
- **Files** — Subsumes the existing Cmd+P file palette
- **Pinned groups & templates** — Launch any saved configuration

## Behavior

- Fuzzy matching, keyboard-navigable (arrow keys + enter)
- Each result shows an icon, label, category tag (Action / Session / Task / History / File), and keyboard shortcut if one exists
- Recently used actions float to the top
- Typing `>` prefix filters to actions only (VS Code convention)

## Implementation Notes

- New `CommandPalette.tsx` component, rendered in `AppShell`
- A registry pattern — each feature area registers its commands (actions, sessions, board, history, files)
- Replaces `FilePalette.tsx` (Cmd+P becomes an alias that opens Cmd+K pre-filtered to files)

## Open Questions

- Should results be grouped by category or mixed by relevance?
- How to handle actions that need parameters (e.g., "new session in folder X")?
- Should the palette support chained commands?
