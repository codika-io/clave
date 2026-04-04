# In-App Documentation & What's New — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Help tab in the right side panel with searchable markdown docs, a What's New banner for post-update feature announcements, and `clave://navigate` deep links connecting both.

**Architecture:** Extend the existing right side panel (`SidePanel.tsx`) with a third "Help" tab. Help content lives as static markdown files + JSON index in `src/renderer/src/help/`. A shared navigation utility resolves `clave://navigate/` links to store actions. A slim `WhatsNewBanner` component reads version from main process via new IPC handler.

**Tech Stack:** React, Zustand, react-markdown (already in project), Electron IPC, Tailwind v4 CSS

**Spec:** `docs/features/in-app-docs/design-spec.md`

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `src/renderer/src/help/index.json` | Help doc index (id, title, subtitle, keywords) |
| `src/renderer/src/help/whats-new.json` | What's New entries per version |
| `src/renderer/src/help/getting-started.md` | Help doc: Getting Started |
| `src/renderer/src/help/sessions.md` | Help doc: Sessions |
| `src/renderer/src/help/board.md` | Help doc: Kanban Board |
| `src/renderer/src/help/git.md` | Help doc: Git Panel |
| `src/renderer/src/help/groups.md` | Help doc: Session Groups |
| `src/renderer/src/help/files.md` | Help doc: File Browser |
| `src/renderer/src/help/history.md` | Help doc: History |
| `src/renderer/src/help/usage.md` | Help doc: Usage Analytics |
| `src/renderer/src/help/shortcuts.md` | Help doc: Keyboard Shortcuts |
| `src/renderer/src/help/remote.md` | Help doc: Remote Sessions |
| `src/renderer/src/lib/navigation.ts` | `clave://navigate` target → store action resolver |
| `src/renderer/src/components/help/HelpPanel.tsx` | Help tab panel component (list + doc view) |
| `src/renderer/src/components/help/WhatsNewBanner.tsx` | Post-update feature banner |

### Modified Files
| File | Change |
|---|---|
| `src/renderer/src/store/session-store.ts` | Extend `sidePanelTab` type to include `'help'` |
| `src/renderer/src/components/git/SidePanel.tsx` | Add Help tab button + render `HelpPanel` |
| `src/renderer/src/components/files/MarkdownRenderer.tsx` | Intercept `clave://` links |
| `src/renderer/src/components/layout/AppShell.tsx` | Add Cmd+? shortcut, render `WhatsNewBanner` |
| `src/main/ipc-handlers/app-handlers.ts` | Add `app:get-version` IPC handler |
| `src/preload/index.ts` | Expose `getAppVersion` |
| `src/preload/index.d.ts` | Add `getAppVersion` to `ElectronAPI` type |

---

### Task 0: Commit brainstorming artifacts

**Files:**
- Add: `CHANGELOG.md`
- Add: `docs/features/command-palette/README.md`
- Add: `docs/features/in-app-docs/README.md`
- Add: `docs/features/in-app-docs/design-spec.md`
- Add: `docs/features/ai-assistant/README.md`
- Add: `docs/superpowers/plans/2026-04-04-in-app-docs.md`

- [ ] **Step 1: Stage and commit all brainstorming docs**

```bash
git add CHANGELOG.md docs/features/ docs/superpowers/
git commit -m "docs: add changelog, feature ideas, and in-app-docs design spec"
```

---

### Task 1: Expose app version to renderer

**Files:**
- Modify: `src/main/ipc-handlers/app-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add IPC handler in main process**

In `src/main/ipc-handlers/app-handlers.ts`, add at the end of the `registerAppHandlers` function (after the existing handlers):

```typescript
ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})
```

Make sure `app` is imported from `electron` at the top (check if it already is — it likely is since `app-handlers.ts` uses app APIs).

- [ ] **Step 2: Expose in preload**

In `src/preload/index.ts`, add to the `electronAPI` object inside `contextBridge.exposeInMainWorld`:

```typescript
getAppVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
```

- [ ] **Step 3: Add type declaration**

In `src/preload/index.d.ts`, add to the `ElectronAPI` interface:

```typescript
getAppVersion: () => Promise<string>
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers/app-handlers.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose app version to renderer via IPC"
```

---

### Task 2: Extend side panel tab state to include 'help'

**Files:**
- Modify: `src/renderer/src/store/session-store.ts`

- [ ] **Step 1: Update sidePanelTab type**

In `src/renderer/src/store/session-store.ts`, find the `sidePanelTab` property in the `SessionState` interface (line ~47):

```typescript
sidePanelTab: 'files' | 'git'
```

Change to:

```typescript
sidePanelTab: 'files' | 'git' | 'help'
```

- [ ] **Step 2: Update setSidePanelTab signature**

Find the `setSidePanelTab` action type (line ~99):

```typescript
setSidePanelTab: (tab: 'files' | 'git') => void
```

Change to:

```typescript
setSidePanelTab: (tab: 'files' | 'git' | 'help') => void
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: No new errors (the implementation at line ~631 uses a generic `(tab)` param so it doesn't need updating).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/session-store.ts
git commit -m "feat: extend side panel tab state with help tab"
```

---

### Task 3: Create shared navigation utility

**Files:**
- Create: `src/renderer/src/lib/navigation.ts`

- [ ] **Step 1: Create the navigation resolver**

Create `src/renderer/src/lib/navigation.ts`:

```typescript
import { useSessionStore } from '../store/session-store'
import type { ActiveView } from '../store/session-types'

const VIEW_TARGETS: Set<string> = new Set([
  'terminals',
  'board',
  'history',
  'settings',
  'usage',
  'agents',
])

const SIDE_PANEL_TABS: Record<string, 'files' | 'git' | 'help'> = {
  'side:files': 'files',
  'side:git': 'git',
  'side:help': 'help',
}

export function navigateTo(target: string): boolean {
  const store = useSessionStore.getState()

  if (VIEW_TARGETS.has(target)) {
    store.setActiveView(target as ActiveView)
    return true
  }

  const sideTab = SIDE_PANEL_TABS[target]
  if (sideTab) {
    if (!store.showFileTree) {
      store.toggleFileTree()
    }
    store.setSidePanelTab(sideTab)
    return true
  }

  return false
}

export function handleClaveLink(href: string): boolean {
  if (!href.startsWith('clave://navigate/')) return false
  const target = href.replace('clave://navigate/', '')
  return navigateTo(target)
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/navigation.ts
git commit -m "feat: add clave:// navigation link resolver"
```

---

### Task 4: Intercept clave:// links in MarkdownRenderer

**Files:**
- Modify: `src/renderer/src/components/files/MarkdownRenderer.tsx`

- [ ] **Step 1: Add import**

At the top of `MarkdownRenderer.tsx`, add:

```typescript
import { handleClaveLink } from '../../lib/navigation'
```

- [ ] **Step 2: Update the anchor tag renderer**

Find the existing `a` component override (around line 52–60):

```tsx
a: ({ href, children }) => (
  <a href={href} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
    {children}
  </a>
)
```

Replace with:

```tsx
a: ({ href, children }) => (
  <a
    href={href}
    className="text-accent hover:underline cursor-pointer"
    onClick={(e) => {
      if (href && handleClaveLink(href)) {
        e.preventDefault()
      }
    }}
    target="_blank"
    rel="noopener noreferrer"
  >
    {children}
  </a>
)
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/files/MarkdownRenderer.tsx
git commit -m "feat: intercept clave:// navigation links in markdown renderer"
```

---

### Task 5: Create help content files

**Files:**
- Create: `src/renderer/src/help/index.json`
- Create: All 10 markdown help docs
- Create: `src/renderer/src/help/whats-new.json`

- [ ] **Step 1: Create index.json**

Create `src/renderer/src/help/index.json`:

```json
[
  {
    "id": "getting-started",
    "title": "Getting Started",
    "subtitle": "What is Clave and how to use it",
    "keywords": ["intro", "overview", "first", "new", "welcome"]
  },
  {
    "id": "sessions",
    "title": "Sessions",
    "subtitle": "Claude mode, terminal mode, and dangerous mode",
    "keywords": ["claude", "terminal", "dangerous", "create", "close", "kill"]
  },
  {
    "id": "board",
    "title": "Kanban Board",
    "subtitle": "Queue tasks and let Claude work through them",
    "keywords": ["kanban", "task", "queue", "drag", "drop", "tag", "run"]
  },
  {
    "id": "git",
    "title": "Git Panel",
    "subtitle": "Staging, committing, push, pull, and Git Journey",
    "keywords": ["git", "commit", "push", "pull", "diff", "stage", "journey"]
  },
  {
    "id": "groups",
    "title": "Session Groups",
    "subtitle": "Groups, pinned configs, .clave files, and templates",
    "keywords": ["group", "pin", "pinned", "clave", "template", "workspace", "toolbar"]
  },
  {
    "id": "files",
    "title": "File Browser",
    "subtitle": "Browse files, preview markdown, and search with Cmd+P",
    "keywords": ["file", "browse", "tree", "preview", "palette", "markdown"]
  },
  {
    "id": "history",
    "title": "History",
    "subtitle": "Browse past Claude Code sessions and conversations",
    "keywords": ["history", "past", "session", "conversation", "search"]
  },
  {
    "id": "usage",
    "title": "Usage Analytics",
    "subtitle": "Token usage, cost estimates, and activity patterns",
    "keywords": ["usage", "token", "cost", "analytics", "model"]
  },
  {
    "id": "shortcuts",
    "title": "Keyboard Shortcuts",
    "subtitle": "Full shortcut reference",
    "keywords": ["keyboard", "shortcut", "hotkey", "key", "cmd"]
  },
  {
    "id": "remote",
    "title": "Remote Sessions",
    "subtitle": "SSH locations and remote terminal sessions",
    "keywords": ["remote", "ssh", "location", "server"]
  }
]
```

- [ ] **Step 2: Create getting-started.md**

Create `src/renderer/src/help/getting-started.md`:

```markdown
# Getting Started

Clave is a desktop app for managing multiple Claude Code terminal sessions side by side. Instead of juggling tabs or tmux panes, you get a visual workspace with integrated tools.

## Your First Session

1. Press **Cmd+N** to create a new Claude Code session
2. Claude starts in the terminal — type a prompt and go
3. The session appears in the left sidebar with a status indicator

## Session Types

- **Claude Code** (Cmd+N) — A full Claude Code session with AI assistance
- **Terminal** (Cmd+T) — A plain shell, no Claude
- **Dangerous Mode** (Cmd+D) — Claude Code with `--dangerously-skip-permissions` (skips approval prompts)

## What Else Can Clave Do?

- **[Kanban Board](clave://navigate/board)** — Queue up tasks and let Claude work through them
- **[Git Panel](clave://navigate/side:git)** — Stage, commit, push, and visualize your git history
- **[File Browser](clave://navigate/side:files)** — Browse and preview files in your project
- **[History](clave://navigate/history)** — Browse past Claude Code sessions
- **[Usage Analytics](clave://navigate/usage)** — Track token usage and costs

## Navigation

- **Left sidebar** — Your sessions, groups, board, and history
- **Right sidebar** (Cmd+E) — File browser and git panel
- **Cmd+P** — Quick file search
- **Cmd+B** — Toggle left sidebar
- **Cmd+,** — Settings (theme, profile, templates)
```

- [ ] **Step 3: Create sessions.md**

Create `src/renderer/src/help/sessions.md`:

```markdown
# Sessions

Sessions are the core of Clave. Each session is an independent terminal running in its own tab.

## Creating Sessions

| Shortcut | Type | Description |
|---|---|---|
| Cmd+N | Claude Code | AI-assisted coding session |
| Cmd+T | Terminal | Plain shell session |
| Cmd+D | Dangerous | Claude Code without permission prompts |

You can also create sessions from the **+** button in the sidebar.

## Session Status

Each session shows a colored dot in the sidebar:

- **Green (active)** — Claude is generating a response
- **Blue (idle)** — Waiting for your input
- **Amber (permission)** — Claude is asking for permission to run a tool
- **Gray (ended)** — Session has finished

## Session Groups

Drag sessions together in the sidebar to create groups. Groups let you:

- Organize related sessions (e.g., "Frontend + API + Tests")
- Collapse/expand to reduce clutter
- Color-code for visual distinction

See [Session Groups](clave://navigate/side:help) for more on pinned groups and .clave files.

## Closing Sessions

- **Cmd+Backspace** — Kill the focused session
- Right-click a session in the sidebar → Close

## Auto-Naming

Sessions are automatically named based on your first message to Claude. The name updates as the conversation progresses.
```

- [ ] **Step 4: Create board.md**

Create `src/renderer/src/help/board.md`:

```markdown
# Kanban Board

The board lets you queue up tasks and run them through Claude Code sessions.

[Open the Board](clave://navigate/board)

## Columns

The board has four default columns:

- **Backlog** — Tasks waiting to be worked on (new tasks land here)
- **Ready** — Tasks you've prioritized for soon
- **Running** — Tasks currently being worked on by a Claude session
- **Done** — Completed tasks

Drag cards between columns to organize your work. You can also add custom columns.

## Creating Tasks

Click the **+** button on any column to add a task. Each task can have:

- **Title** — What needs to be done
- **Prompt** — The exact prompt to send to Claude (required to run)
- **Notes** — Context or details for reference
- **Folder** — Working directory for the session
- **Tags** — Color-coded labels for categorization

## Running Tasks

Click the **Run** button on a card (or in the detail panel). This:

1. Creates a new Claude Code session
2. Moves the card to the **Running** column
3. Sends the prompt to Claude automatically

The card shows live session status (active/idle/permission needed).

## Tags

Add tags to categorize tasks. Tags have colors and can be filtered in the board toolbar. Click a tag in the filter bar to show only matching cards.

## History Integration

Cards in the Done column show a summary of what Claude accomplished. Click **Browse History** to see the full conversation.
```

- [ ] **Step 5: Create git.md**

Create `src/renderer/src/help/git.md`:

```markdown
# Git Panel

The git panel gives you staging, committing, diffing, and push/pull without leaving Clave.

[Open Git Panel](clave://navigate/side:git)

## Opening the Panel

- **Cmd+Shift+G** — Open right sidebar on the Git tab
- Or click the **Git** tab in the right sidebar

## Staging and Committing

1. Files appear in three sections: **Staged**, **Modified**, and **Untracked**
2. Click the **+** icon on a file to stage it (or **-** to unstage)
3. Write a commit message in the text box at the bottom
4. Click **Commit** (or use the AI-generated message button)

## AI Commit Messages

Click the sparkle icon next to the commit input to generate a commit message based on your staged changes.

## Diff Preview

Click any file in the git panel to see a side-by-side diff. Use arrow keys to navigate between changes.

## Push and Pull

- **Push** — Send your commits to the remote
- **Pull** — Fetch and merge remote changes (supports merge, rebase, and fast-forward strategies)
- **Magic Sync** — One-click pull + push

## Git Journey

Click the journey icon in the git panel toolbar to visualize your commit history grouped by push. Each dot is a commit — click to see its diff.

## Multi-Repo Support

If your workspace contains multiple git repos, the panel auto-detects them and lets you switch between them.
```

- [ ] **Step 6: Create groups.md**

Create `src/renderer/src/help/groups.md`:

```markdown
# Session Groups

Groups let you organize sessions and save workspace configurations for quick launch.

## Creating Groups

Drag one session onto another in the sidebar to create a group. You can:

- **Rename** — Right-click → Rename
- **Color** — Right-click → Change color
- **Collapse/Expand** — Click the group header

## Pinned Groups

Pin a group configuration to the sidebar for one-click relaunch. Pinned groups remember:

- Session names and commands
- Working directories
- Colors and icons
- Whether to auto-launch localhost URLs

Find pinned groups in the **Pinned** section at the top of the sidebar.

## .clave Files

Drop a `.clave` JSON file into the pin area to import a workspace configuration. These files define:

- Session groups with pre-configured terminals
- Working directories and commands
- Icons, colors, and categories

Share `.clave` files with your team to standardize workspace setups.

## Templates

Templates are saved session launch configurations. Create them in [Settings](clave://navigate/settings) → Templates. They appear as options when creating new sessions.

## Toolbar Quick Actions

Pinned groups marked as toolbar items show buttons in the main toolbar for one-click terminal spawning.
```

- [ ] **Step 7: Create files.md**

Create `src/renderer/src/help/files.md`:

```markdown
# File Browser

Browse, search, and preview files in your project without switching apps.

[Open File Browser](clave://navigate/side:files)

## File Tree

The right sidebar's **Files** tab shows a file tree for the current session's working directory. Toggle between list and tree views with the icon buttons at the top.

## Quick Search (Cmd+P)

Press **Cmd+P** to open the file palette — a fuzzy search across all files in the current directory. Start typing to filter, arrow keys to navigate, Enter to open.

## File Preview

Click any file in the tree to preview it. Markdown files render with full formatting. Code files show syntax highlighting.

## Opening the Sidebar

- **Cmd+E** — Toggle the right sidebar
- The sidebar remembers which tab (Files/Git/Help) you had open
```

- [ ] **Step 8: Create history.md**

Create `src/renderer/src/help/history.md`:

```markdown
# History

Browse and search past Claude Code sessions across all your projects.

[Open History](clave://navigate/history)

## Viewing History

The history view shows all past Claude Code sessions, grouped by project. Each entry shows:

- Session title
- Date and time
- Project path

Click a session to view the full conversation with rendered markdown.

## Searching

Use the search bar to find sessions by content. Search supports CJK characters and highlights matches in the conversation.

## Sidebar History

The left sidebar shows your 10 most recent sessions under the **History** section. Click any to view the full conversation.
```

- [ ] **Step 9: Create usage.md**

Create `src/renderer/src/help/usage.md`:

```markdown
# Usage Analytics

Track token usage, costs, and activity patterns across all your Claude Code sessions.

[Open Usage](clave://navigate/usage)

## What It Shows

- **Daily message and session counts** — How much you're using Claude
- **Token breakdown by model** — Input, output, cache read, and cache creation tokens
- **Cost estimates** — Based on current model pricing (Opus, Sonnet, Haiku)
- **Hourly activity** — When you're most active during the day

## Data Source

Usage data is read from Claude Code's session files (`~/.claude/projects/**/*.jsonl`). No data is sent anywhere — all analysis happens locally.
```

- [ ] **Step 10: Create shortcuts.md**

Create `src/renderer/src/help/shortcuts.md`:

```markdown
# Keyboard Shortcuts

## Sessions

| Shortcut | Action |
|---|---|
| Cmd+N | New Claude Code session |
| Cmd+T | New terminal session |
| Cmd+D | New dangerous mode session |
| Cmd+Backspace | Kill focused session |
| Cmd+1–9 | Switch to session by index |
| Cmd+Shift+] | Next session |
| Cmd+Shift+[ | Previous session |

## Navigation

| Shortcut | Action |
|---|---|
| Cmd+B | Toggle left sidebar |
| Cmd+E | Toggle right sidebar |
| Cmd+P | File palette (quick search) |
| Cmd+F | Focus sidebar search |
| Cmd+, | Open settings |
| Cmd+Shift+G | Open git panel |
| Cmd+? | Open help panel |

## Files

| Shortcut | Action |
|---|---|
| Cmd+W | Close focused file tab |
```

- [ ] **Step 11: Create remote.md**

Create `src/renderer/src/help/remote.md`:

```markdown
# Remote Sessions

Connect to remote machines via SSH and run Claude Code sessions there.

## Adding a Location

1. Open [Settings](clave://navigate/settings) → Locations
2. Click **Add Location**
3. Enter SSH connection details (host, user, key/password)

## Remote Sessions

Once a location is added, create sessions that run on the remote machine. Remote sessions show a location badge in the sidebar.

## Remote File Browsing

The file tree in the right sidebar works with remote sessions too — browse files on the remote machine without a separate SFTP client.
```

- [ ] **Step 12: Create whats-new.json**

Create `src/renderer/src/help/whats-new.json`:

```json
[]
```

Empty for now — entries will be added with future releases. The first real entry will be added when this feature ships.

- [ ] **Step 13: Commit all help content**

```bash
git add src/renderer/src/help/
git commit -m "feat: add help documentation content and whats-new data"
```

---

### Task 6: Create HelpPanel component

**Files:**
- Create: `src/renderer/src/components/help/HelpPanel.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/components/help/HelpPanel.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { MarkdownRenderer } from '../files/MarkdownRenderer'
import helpIndex from '../../help/index.json'

// Import all help markdown files as raw strings
const helpDocs: Record<string, string> = import.meta.glob('../../help/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

// Normalize keys from glob paths to doc IDs
// e.g., '../../help/getting-started.md' -> 'getting-started'
function getDocContent(id: string): string | null {
  for (const [path, content] of Object.entries(helpDocs)) {
    if (path.endsWith(`/${id}.md`)) return content
  }
  return null
}

interface HelpEntry {
  id: string
  title: string
  subtitle: string
  keywords: string[]
}

export function HelpPanel(): JSX.Element {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')

  const filteredDocs = useMemo(() => {
    if (!filterText) return helpIndex as HelpEntry[]
    const lower = filterText.toLowerCase()
    return (helpIndex as HelpEntry[]).filter(
      (doc) =>
        doc.title.toLowerCase().includes(lower) ||
        doc.subtitle.toLowerCase().includes(lower) ||
        doc.keywords.some((k) => k.includes(lower)),
    )
  }, [filterText])

  const selectedDoc = selectedDocId ? getDocContent(selectedDocId) : null
  const selectedTitle = selectedDocId
    ? (helpIndex as HelpEntry[]).find((d) => d.id === selectedDocId)?.title
    : null

  if (selectedDocId && selectedDoc !== null) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle flex-shrink-0">
          <button
            onClick={() => setSelectedDocId(null)}
            className="p-0.5 rounded hover:bg-surface-200 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-text-primary truncate">
            {selectedTitle}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <MarkdownRenderer content={selectedDoc} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle flex-shrink-0">
        <input
          type="text"
          placeholder="Search help..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="flex-1 h-[20px] px-2 rounded bg-surface-100 text-[11px] text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-border transition-colors min-w-0"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredDocs.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setSelectedDocId(doc.id)}
            className="w-full text-left px-3 py-2.5 hover:bg-surface-100 transition-colors border-b border-border-subtle"
          >
            <div className="text-xs font-medium text-text-primary">{doc.title}</div>
            <div className="text-[11px] text-text-tertiary mt-0.5">{doc.subtitle}</div>
          </button>
        ))}
        {filteredDocs.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-text-tertiary">
            No matching docs
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Note: If `import.meta.glob` with `?raw` for `.md` files needs a Vite config change, check `electron-vite.config.ts` and add `assetsInclude: ['**/*.md']` if needed. If the glob import doesn't work, fallback to explicit imports:

```typescript
import gettingStarted from '../../help/getting-started.md?raw'
import sessions from '../../help/sessions.md?raw'
// ... etc
const helpDocsMap: Record<string, string> = {
  'getting-started': gettingStarted,
  'sessions': sessions,
  // ... etc
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/help/HelpPanel.tsx
git commit -m "feat: add HelpPanel component with list and doc views"
```

---

### Task 7: Integrate Help tab into SidePanel

**Files:**
- Modify: `src/renderer/src/components/git/SidePanel.tsx`

- [ ] **Step 1: Add import**

At the top of `SidePanel.tsx`, add:

```typescript
import { HelpPanel } from '../help/HelpPanel'
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
```

- [ ] **Step 2: Add Help tab button**

Find the tab buttons section (around line 250–283) inside the segmented control `div`. There are two buttons for Files and Git. Add a third button after the Git button, following the same pattern:

```tsx
<button
  onClick={() => setSidePanelTab('help')}
  className={`flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
    effectiveTab === 'help'
      ? 'bg-surface-200 text-text-primary'
      : 'text-text-tertiary hover:text-text-secondary'
  }`}
>
  <QuestionMarkCircleIcon className="w-3.5 h-3.5" />
  Help
</button>
```

- [ ] **Step 3: Add Help panel rendering**

Find the tab content section (around line 428–462) where `sidePanelTab` determines what renders. Add a branch for the help tab. After the git content block, add:

```tsx
{effectiveTab === 'help' && <HelpPanel />}
```

- [ ] **Step 4: Hide path bar and git toolbar when on help tab**

The path display row (Row 2, around line 289) and git toolbar (around line 397) should be hidden when the help tab is active. Wrap them with a condition:

For the path row, add `effectiveTab !== 'help'` to its rendering condition.

For the git toolbar, it already checks `isGitTabActive` so it won't show on the help tab.

- [ ] **Step 5: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 6: Build and verify visually**

```bash
npx electron-vite build
```

Launch the app and verify:
- Help tab appears in the right sidebar
- Clicking it shows the doc list
- Clicking a doc renders markdown
- Back button returns to list
- Filter input works
- `clave://navigate` links in docs navigate to the correct views

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/git/SidePanel.tsx
git commit -m "feat: integrate Help tab into right side panel"
```

---

### Task 8: Create WhatsNewBanner component

**Files:**
- Create: `src/renderer/src/components/help/WhatsNewBanner.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/components/help/WhatsNewBanner.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { navigateTo } from '../../lib/navigation'
import whatsNewData from '../../help/whats-new.json'

interface WhatsNewEntry {
  version: string
  title: string
  description: string
  action: { type: string; target: string }
}

const LAST_SEEN_KEY = 'clave-whats-new-last-seen-version'

export function WhatsNewBanner(): JSX.Element | null {
  const [visible, setVisible] = useState(false)
  const [entry, setEntry] = useState<WhatsNewEntry | null>(null)

  useEffect(() => {
    async function check(): Promise<void> {
      try {
        const currentVersion = await window.electronAPI.getAppVersion()
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY)

        // Don't show on fresh install (no last seen version)
        if (!lastSeen) {
          localStorage.setItem(LAST_SEEN_KEY, currentVersion)
          return
        }

        // Don't show if version hasn't changed
        if (lastSeen === currentVersion) return

        // Find entry for current version
        const match = (whatsNewData as WhatsNewEntry[]).find(
          (e) => e.version === currentVersion,
        )
        if (match) {
          setEntry(match)
          setVisible(true)
        } else {
          // No announcement for this version, just update last seen
          localStorage.setItem(LAST_SEEN_KEY, currentVersion)
        }
      } catch {
        // Silently fail if version check fails
      }
    }
    check()
  }, [])

  function dismiss(): void {
    setVisible(false)
    if (entry) {
      localStorage.setItem(LAST_SEEN_KEY, entry.version)
    }
  }

  function handleTryIt(): void {
    if (entry?.action.type === 'navigate') {
      navigateTo(entry.action.target)
    }
    dismiss()
  }

  if (!visible || !entry) return null

  return (
    <div className="mx-2 mb-1 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 flex items-center gap-2 text-xs">
      <span className="text-text-secondary flex-1">
        <span className="font-medium text-text-primary">New in {entry.version}:</span>{' '}
        {entry.title} — {entry.description}
      </span>
      <button
        onClick={handleTryIt}
        className="text-accent hover:text-accent-hover font-medium whitespace-nowrap"
      >
        Try it
      </button>
      <button
        onClick={dismiss}
        className="p-0.5 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-secondary transition-colors"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/help/WhatsNewBanner.tsx
git commit -m "feat: add WhatsNewBanner component"
```

---

### Task 9: Integrate banner and shortcut into AppShell

**Files:**
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add imports**

At the top of `AppShell.tsx`, add:

```typescript
import { WhatsNewBanner } from '../help/WhatsNewBanner'
```

- [ ] **Step 2: Add Cmd+? keyboard shortcut**

Find the keyboard shortcut handler (the `handleKeyDown` function inside the `useEffect` around line 158). Add a new shortcut case. Find an appropriate location near the existing Cmd+Shift+G handler (around line 174):

```typescript
// Cmd+? (Cmd+Shift+/) — open help panel
if (e.metaKey && e.shiftKey && e.key === '/') {
  e.preventDefault()
  const { showFileTree, toggleFileTree, sidePanelTab, setSidePanelTab } =
    useSessionStore.getState()
  if (showFileTree && sidePanelTab === 'help') {
    toggleFileTree()
  } else {
    if (!showFileTree) toggleFileTree()
    setSidePanelTab('help')
  }
  return
}
```

- [ ] **Step 3: Render WhatsNewBanner**

Find the toolbar area in the JSX (around line 437 — the `floating-card` div for the toolbar). Insert `<WhatsNewBanner />` just **above** the toolbar div:

```tsx
<WhatsNewBanner />
{/* existing toolbar div below */}
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 5: Build and verify**

```bash
npx electron-vite build
```

Launch the app and verify:
- Cmd+? opens the Help tab in the right sidebar
- Cmd+? again closes the sidebar (when already on Help tab)
- WhatsNewBanner doesn't appear (expected — `whats-new.json` is empty)

To test the banner, temporarily add an entry to `whats-new.json` matching the current version and set a different `lastSeenVersion` in localStorage.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat: add Cmd+? shortcut and WhatsNewBanner to app shell"
```

---

### Task 10: Final integration test and cleanup

- [ ] **Step 1: Full build and typecheck**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Fix any lint issues that arise.

- [ ] **Step 3: Manual verification checklist**

Launch the built app and verify:

1. Right sidebar shows three tabs: Files, Git, Help
2. Help tab shows all 10 docs in a list
3. Filter input filters docs by title/subtitle/keywords
4. Clicking a doc shows rendered markdown with back button
5. `clave://navigate` links in docs navigate correctly (test: "Open the Board" in getting-started.md)
6. Cmd+? opens/closes the Help tab
7. Cmd+Shift+G still works for Git tab
8. Cmd+E still toggles the sidebar
9. WhatsNewBanner doesn't show on fresh state (no previous version)
10. Files and Git tabs still work normally

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix: address lint and integration issues"
```

Only run this step if there were fixes needed.

- [ ] **Step 5: Update CHANGELOG.md**

Add an entry under `[Unreleased]` (or create a new version section):

```markdown
## [Unreleased]

### Added
- Help tab in right side panel with searchable documentation
- What's New banner for post-update feature announcements
- `clave://navigate` deep links in help docs
- Cmd+? keyboard shortcut to open Help tab
- App version exposed to renderer via IPC
```

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog with in-app docs feature"
```
