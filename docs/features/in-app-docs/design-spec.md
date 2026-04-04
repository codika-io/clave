# In-App Documentation & What's New — Design Spec

**Date:** 2026-04-04
**Status:** Approved for implementation

## Overview

Clave has powerful features but no way for users to discover or learn about them. This spec adds two complementary features:

1. **Help tab** — A third tab in the right side panel (alongside Files and Git) with searchable markdown documentation
2. **What's New banner** — A version-triggered notification that highlights the most notable feature after an app update

Both features use `clave://navigate` links to jump users directly to the relevant feature.

## 1. Help Tab

### Location

Third tab in the right side panel. Tab header becomes: `Files | Git | Help`.

Keyboard shortcut: Cmd+? to open the right panel focused on the Help tab.

Icon: `QuestionMarkCircleIcon` from `@heroicons/react/24/outline`.

### Component: `HelpPanel.tsx`

Follows the same patterns as `FileTreePanel` and `GitStatusPanel`.

**Two states:**

1. **List view** (default)
   - Filter input at top (same pattern as Files tab filter)
   - Scrollable list of doc entries below
   - Each entry shows: title and brief subtitle
   - Filter matches against title and keywords (substring match)
   - Click an entry to open it

2. **Doc view**
   - Back arrow + doc title in a header bar
   - Rendered markdown below, scrollable
   - `clave://` links are clickable and trigger navigation
   - Standard markdown rendering via existing `MarkdownRenderer.tsx`

### State Management

No new Zustand store needed. Local component state tracks:
- `selectedDocId: string | null` — which doc is open (null = list view)
- `filterText: string` — search input value

The right side panel's existing tab state extends from `'files' | 'git'` to `'files' | 'git' | 'help'`.

### Help Content

**Location:** `src/renderer/src/help/`

**Index file:** `index.json`
```json
[
  {
    "id": "getting-started",
    "title": "Getting Started",
    "subtitle": "What is Clave and how to use it",
    "keywords": ["intro", "overview", "first", "new"]
  },
  {
    "id": "sessions",
    "title": "Sessions",
    "subtitle": "Claude mode, terminal mode, and dangerous mode",
    "keywords": ["claude", "terminal", "dangerous", "create", "close"]
  }
]
```

**Markdown files:** One `.md` file per doc entry, named by `id` (e.g., `getting-started.md`).

**Full doc list:**

| id | Title | Content |
|---|---|---|
| `getting-started` | Getting Started | What is Clave, why use it vs a plain terminal, creating your first session |
| `sessions` | Sessions | Claude mode vs terminal mode vs dangerous mode, creating/closing, activity status |
| `board` | Kanban Board | Creating tasks, running them, drag-and-drop, tags, auto-movement, history on cards |
| `git` | Git Panel | Staging, committing, push/pull, diff preview, Git Journey visualization |
| `groups` | Session Groups | Groups, pinned groups, .clave files, templates, workspaces, toolbar quick actions |
| `files` | File Browser | File tree, file palette (Cmd+P), file preview, markdown rendering |
| `history` | History | Browsing past Claude sessions, searching, full conversation viewer |
| `usage` | Usage Analytics | Token usage, cost estimates, activity distribution by hour |
| `shortcuts` | Keyboard Shortcuts | Full shortcut reference table |
| `remote` | Remote Sessions | SSH locations, remote terminal sessions, remote file browsing |

**Markdown conventions:**
- Keep docs short and scannable — use headers, bullet points, tables
- Include `[Open the board ->](clave://navigate/board)` links where relevant
- No screenshots in v1 (keep docs easy to maintain; revisit later)

## 2. What's New Banner

### Trigger

On app launch, compare the app version (exposed to renderer via `window.electronAPI` or injected at build time) against `lastSeenVersion` stored in localStorage.

If the version has changed, check `whats-new.json` for entries matching the new version. If a match exists, show the banner.

### Data: `whats-new.json`

Bundled in the app alongside help content at `src/renderer/src/help/whats-new.json`.

```json
[
  {
    "version": "1.27.0",
    "title": "Kanban Board",
    "description": "Queue tasks and let Claude work through them",
    "action": { "type": "navigate", "target": "board" }
  },
  {
    "version": "1.28.0",
    "title": "In-App Help",
    "description": "Browse documentation right inside Clave",
    "action": { "type": "navigate", "target": "side:help" }
  }
]
```

Only one entry per version — the most notable feature. Not every changelog item.

### UI: `WhatsNewBanner.tsx`

A slim banner rendered below the toolbar in `AppShell.tsx`.

- Accent background color (using `--accent` CSS variable)
- Content: "New in [version]: [title] — [description]" + "Try it" link + dismiss X button
- "Try it" triggers the `action` navigation and dismisses
- Dismiss (X) updates `lastSeenVersion` in localStorage

### Persistence

- `lastSeenVersion` stored in localStorage
- Once dismissed or "Try it" clicked, the banner never shows again for that version
- On fresh install (no `lastSeenVersion`), do not show — new users haven't updated, they've just installed

## 3. Navigation Links (`clave://navigate`)

### Targets

A mapping of string targets to store actions:

| Target | Action |
|---|---|
| `terminals` | `setActiveView('terminals')` |
| `board` | `setActiveView('board')` |
| `history` | `setActiveView('history')` |
| `settings` | `setActiveView('settings')` |
| `usage` | `setActiveView('usage')` |
| `agents` | `setActiveView('agents')` |
| `side:files` | Open right panel, switch to Files tab |
| `side:git` | Open right panel, switch to Git tab |
| `side:help` | Open right panel, switch to Help tab |

### Implementation

Add a click handler in `MarkdownRenderer.tsx` that intercepts links with the `clave://` scheme:

```typescript
const handleLinkClick = (href: string) => {
  if (href.startsWith('clave://navigate/')) {
    const target = href.replace('clave://navigate/', '')
    // call appropriate store action based on target
  }
}
```

The same target resolution is used by `WhatsNewBanner.tsx` for its action button.

Extract the target-to-action mapping into a shared utility (e.g., `src/renderer/src/lib/navigation.ts`) so both `MarkdownRenderer` and `WhatsNewBanner` use the same logic.

## 4. Changelog

`CHANGELOG.md` exists in the repo root (already created). Uses [Keep a Changelog](https://keepachangelog.com/) format.

**Relationship to What's New:** The changelog is the comprehensive record. What's New is the curated highlight. When cutting a release, the developer picks the single most notable "Added" item from the changelog to add to `whats-new.json`.

**Future consideration:** The Help tab could surface the full changelog as a rendered doc, but this is not in v1 scope.

## 5. Integration Points

### `AppShell.tsx`
- Render `WhatsNewBanner` below the toolbar
- Register Cmd+? shortcut to open Help tab

### `SidePanel.tsx`
- Add "Help" tab to the tab header
- Render `HelpPanel` when Help tab is active
- Extend tab state type to include `'help'`

### `MarkdownRenderer.tsx`
- Add `clave://` link interception in the click handler

### Session store
- Extend `sidePanelTab` type from `'files' | 'git'` to `'files' | 'git' | 'help'`

## 6. What's NOT in Scope

- Interactive onboarding / step-by-step walkthrough (future, builds on top of docs)
- Screenshots or GIFs in help docs (keep v1 text-only for easy maintenance)
- Fuzzy search in help panel (substring match is sufficient for ~10 docs)
- Help content localization / i18n (English only in v1)
- Proactive contextual hints / tooltips
- Command palette (separate feature, see `docs/features/command-palette/`)
