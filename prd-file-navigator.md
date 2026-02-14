# PRD: File Navigator

## Problem

Clave users frequently need to reference file paths during Claude Code sessions — passing paths as arguments, pointing Claude at specific files, or composing multi-file commands. Today this requires leaving Clave to open Finder or VS Code, locating the file, and dragging it back into the terminal. This context-switching is the single biggest friction point in a multi-session workflow.

A secondary (but lower-priority) need is **peeking at file contents** — quickly checking what's in a file without leaving Clave. This should feel like a tooltip, not a tab.

## Design Principles

1. **The terminal is the destination.** Every file interaction should end with "insert path into terminal." This is a path-insertion tool, not a file manager.
2. **Invisible when not needed.** No permanent UI cost. Features are triggered on demand and disappear after use.
3. **Clave is not an IDE.** No editing, no tabs, no file creation/deletion. Read-only at most.
4. **Follow existing patterns.** Same shell escaping, same IPC architecture, same theme tokens, same keyboard-first philosophy.

## Features

### Feature 1: File Palette (Cmd+P)

A fast, ephemeral fuzzy-search overlay for finding and inserting file paths.

#### Interaction

1. User presses **Cmd+P** (or clicks a small search icon in the toolbar).
2. A centered modal overlay appears (similar to VS Code's quick open or Spotlight).
3. The palette is scoped to the **focused session's `cwd`**.
4. User types a query — files are fuzzy-matched in real-time.
5. Results show relative paths with the matching segments highlighted.
6. User selects a result via arrow keys + Enter (or click).
7. The path is inserted into the focused terminal. The palette closes.

#### Search Behavior

- **Scope:** Recursive file listing from the focused session's `cwd`.
- **Filtering:** Respect `.gitignore` if present. Always exclude `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.next`, `.svelte-kit`, and other common artifact directories.
- **Indexing:** Build the file list on palette open (not background-indexed). Cache it for the session until the palette is closed — no live filesystem watching.
- **Fuzzy matching:** Match against the full relative path (e.g., typing `sst` matches `src/store/session-store.ts`). Rank by match quality, prefer shorter paths and shallower depth on ties.
- **Performance:** Cap the file scan at ~50,000 entries. Show a warning if truncated. For very large repos, suggest narrowing scope.

#### Result Display

Each result row shows:
- **File icon** — minimal, based on extension (folder, code file, config, image, etc.). Use a small icon set, not a full icon theme.
- **Filename** (bold) + **relative directory path** (dimmed). E.g., **session-store.ts** `src/renderer/src/store/`
- **Match highlighting** — matched characters highlighted in accent color.

Show **max 12 results** at a time, scrollable.

#### Actions

| Action | Trigger | Behavior |
|--------|---------|----------|
| Insert relative path | **Enter** | Inserts `'./src/foo/bar.ts'` into focused terminal |
| Insert absolute path | **Cmd+Enter** | Inserts `'/Users/john/project/src/foo/bar.ts'` into focused terminal |
| Quick peek | **Cmd+Shift+Enter** or **Space** (when a result is highlighted) | Opens the file preview panel (see Feature 3) |
| Copy path | **Cmd+C** (when a result is highlighted) | Copies relative path to clipboard |
| Cancel | **Escape** or click outside | Closes palette, no action |

#### Edge Cases

- **No focused session:** Palette is disabled. Show tooltip "Focus a session first" if triggered.
- **Session ended:** Still allow palette — the cwd still exists on disk even if the PTY is dead. Inserting a path writes to the PTY input buffer (which is a no-op if the process exited, but harmless).
- **Empty results:** Show "No files found" with the current query. If the cwd doesn't exist anymore (deleted externally), show "Directory not found."

#### UI Spec

- **Width:** 560px, centered horizontally, positioned ~20% from top of the terminal grid area.
- **Backdrop:** Semi-transparent overlay (`bg-black/40`), click to dismiss.
- **Input field:** Full width, 40px tall, `surface-100` background, `text-primary`, monospace font, placeholder "Search files...".
- **Results list:** Below input, `surface-50` background, `border border-border` separator between input and results.
- **Animation:** Fade in + slight scale up (match existing `fade-in` keyframe). Fade out on dismiss.

---

### Feature 2: File Tree Panel (Right Side)

A collapsible panel showing the focused session's directory tree. Optimized for visual browsing and drag-to-insert workflows.

#### Interaction

1. User presses **Cmd+E** (or clicks a folder icon in the toolbar).
2. A panel slides in from the **right edge** of the window.
3. The panel shows the file tree rooted at the focused session's `cwd`.
4. Clicking a file **inserts its path** into the focused terminal.
5. Dragging a file (or multi-selection) to a terminal inserts the path(s).
6. The panel stays open until explicitly closed (Cmd+E again, or close button).

#### Tree Behavior

- **Root:** The focused session's `cwd`. Display as breadcrumb at the top (e.g., `~/projects/clave`).
- **Lazy loading:** Only load directory contents when a folder is expanded. No upfront recursive scan.
- **Sorting:** Folders first, then files. Alphabetical within each group. Case-insensitive.
- **Filtering:** Respect `.gitignore`. Hide dotfiles by default (toggle to show). Always hide `.git` directory itself.
- **Auto-switch:** When the focused session changes, the tree re-roots to the new session's `cwd`. Preserve expansion state per-session if possible (best-effort, in-memory only).
- **Search within tree:** A small filter input at the top of the panel. Typing filters the visible tree to matching filenames (non-recursive, just hides non-matching entries in expanded folders). This is a simple filter, not a fuzzy search — the palette covers that.

#### Click & Drag Actions

| Action | Trigger | Behavior |
|--------|---------|----------|
| Insert path | **Click** on file | Inserts shell-escaped relative path into focused terminal |
| Insert absolute path | **Cmd+Click** on file | Inserts shell-escaped absolute path |
| Expand/collapse | **Click** on folder chevron | Toggles directory expansion |
| Drag to terminal | **Drag** file(s) from tree | Inserts path(s) into the drop-target terminal |
| Quick peek | **Space** or **Cmd+Click** on file | Opens file preview (see Feature 3) |
| Reveal in Finder | **Right-click → Reveal in Finder** | Opens Finder at that path |
| Copy path | **Right-click → Copy Path** | Copies relative path to clipboard |
| Copy absolute path | **Right-click → Copy Absolute Path** | Copies absolute path to clipboard |

#### Multi-Selection

- **Cmd+Click** to add/remove individual files to selection.
- **Shift+Click** to select a range within the same directory.
- Dragging a multi-selection inserts all paths space-separated.
- Clicking (without Cmd) on a file clears selection and inserts that single path.

#### UI Spec

- **Width:** Default 240px, resizable (min 180px, max 400px). Same resize-handle pattern as the left sidebar.
- **Position:** Right edge of the window, between the terminal grid and the window border. The terminal grid shrinks to accommodate.
- **Header:** Breadcrumb path of the root directory. Close button (X) on the right.
- **Tree items:** 28px row height. 16px indent per depth level. File/folder icons (same minimal set as palette). Filename in `text-primary`, truncated with ellipsis if too long.
- **Background:** `surface-50`, matching the sidebar.
- **Border:** `border-l border-border` on the left edge.
- **Animation:** Slide in from right, 200ms, same easing as sidebar (`ease-out-expo`).
- **Scrolling:** Vertical scroll with custom scrollbar (same as sidebar).

#### Edge Cases

- **No focused session:** Panel shows empty state: "Focus a session to browse files."
- **Switching sessions:** Tree re-roots. If the new session has the same `cwd`, preserve expansion state.
- **Very deep trees:** No limit on depth, but lazy loading keeps it performant. Don't auto-expand beyond 1 level.
- **Permissions errors:** If a directory can't be read, show it as expandable but display "Permission denied" when expanded.

---

### Feature 3: Quick Peek (File Preview)

A lightweight, read-only file preview. Not a tab, not a panel — a dismissible overlay anchored to the file tree or palette.

#### Interaction

1. Triggered from the File Palette (Space or Cmd+Shift+Enter) or File Tree (Space or right-click → Preview).
2. A preview panel appears:
   - From the **palette**: replaces the results list in-place (same modal container).
   - From the **file tree**: appears as an overlay/popover to the left of the tree panel.
3. Shows syntax-highlighted, read-only file contents.
4. Dismissed by pressing **Escape**, clicking outside, or pressing Space on a different file (which replaces the preview).

#### Preview Behavior

- **Syntax highlighting:** Use a lightweight highlighter (e.g., Shiki or Prism). Support common languages: JS/TS, Python, Rust, Go, JSON, YAML, TOML, Markdown, HTML, CSS, shell scripts.
- **Line numbers:** Show line numbers, dimmed.
- **Max file size:** Don't preview files over 1 MB. Show "File too large to preview" with file size.
- **Binary files:** Detect and show "Binary file — cannot preview" with file type and size.
- **Images:** Show a thumbnail preview for PNG, JPG, GIF, SVG, WebP.
- **Scrolling:** Vertical scroll. No horizontal scroll — wrap long lines.
- **No editing.** No cursor, no selection beyond copy. Read-only.

#### UI Spec

- **From palette:** Same width as the palette (560px). Max height 400px. Below the search input, replacing the results list. Back arrow or Escape to return to results.
- **From file tree:** 480px wide, positioned to the left of the tree panel. Max height 70% of window. Floating with subtle shadow.
- **Background:** `surface-50`. Monospace font (`font-mono`). Font size 12px.
- **Header:** Filename + relative path. "Copy path" button. Close button.
- **Theme:** Syntax highlighting colors should match the xterm.js ANSI color palette for visual consistency (dark theme = dark background, light theme = light background).

---

## Technical Architecture

### New IPC Channels

The renderer has no `fs` access. All file system operations go through the main process via IPC.

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `fs:list-files` | renderer → main | `{ cwd: string, gitignore?: boolean }` | `string[]` — flat list of relative paths (for palette) |
| `fs:read-dir` | renderer → main | `{ dirPath: string }` | `Array<{ name, type: 'file'\|'directory', size? }>` — one-level listing (for tree) |
| `fs:read-file` | renderer → main | `{ filePath: string, maxSize?: number }` | `{ content: string, truncated: boolean, size: number, binary: boolean }` |
| `fs:stat` | renderer → main | `{ filePath: string }` | `{ type, size, modified }` or error |

### Main Process: `file-manager.ts` (new)

A new module in `src/main/` that handles file system operations. Responsibilities:
- Recursive file listing with `.gitignore` support (use a library like `fast-glob` or `ignore`).
- Directory reading with type detection.
- File reading with size limits and binary detection.
- All paths validated to prevent path traversal (must be within the session's `cwd` or an ancestor — never allow reading arbitrary system files).

### Renderer Components (new)

```
src/renderer/src/components/
├── files/
│   ├── FilePalette.tsx        — Cmd+P overlay
│   ├── FileTree.tsx           — right panel tree
│   ├── FileTreeItem.tsx       — single row in the tree
│   ├── FilePreview.tsx        — quick peek overlay
│   └── file-icons.tsx         — minimal file icon mapping
```

### Renderer Hooks (new)

```
src/renderer/src/hooks/
├── use-file-search.ts         — fuzzy search logic + IPC call for palette
├── use-file-tree.ts           — lazy directory loading + expansion state
```

### Store Changes

Add to the Zustand store:
```typescript
// File navigator state
filePaletteOpen: boolean
fileTreeOpen: boolean
fileTreeWidth: number              // resizable, persisted
previewFile: string | null         // path of currently previewed file

// Actions
toggleFilePalette: () => void
toggleFileTree: () => void
setFileTreeWidth: (width: number) => void
setPreviewFile: (path: string | null) => void
```

### Path Insertion

Reuse the existing shell-escaping logic from `use-terminal.ts`:
```typescript
const escaped = `'${path.replace(/'/g, "'\\''")}'`
window.electronAPI.writeSession(sessionId, escaped)
```

Extract this into a shared utility (`src/renderer/src/lib/shell.ts`) so both the terminal drag-drop handler and the new file components use the same logic.

### Keyboard Shortcuts Summary

| Shortcut | Action | Scope |
|----------|--------|-------|
| **Cmd+P** | Toggle file palette | Global (window) |
| **Cmd+E** | Toggle file tree panel | Global (window) |
| **Escape** | Close palette / preview / tree | When component is focused |
| **Enter** | Insert relative path (palette) | Palette focused |
| **Cmd+Enter** | Insert absolute path (palette) | Palette focused |
| **Space** | Quick peek selected file | Palette or tree focused |
| **Cmd+C** | Copy path | Palette or tree with selection |

### Security

- **Path traversal prevention:** All `fs:*` IPC handlers must validate that requested paths are within the session's `cwd`. Reject paths containing `..` that escape the root. Use `path.resolve()` and check with `resolvedPath.startsWith(cwd)`.
- **No write operations.** The file manager is strictly read-only. No IPC channel for writing, deleting, or modifying files.
- **File size limits.** Enforce a 1 MB cap on file reads to prevent memory issues with large binaries.

---

## Implementation Priority

### Phase 1: File Palette (Cmd+P)
The highest-value, lowest-complexity feature. Covers 80% of the use case (user knows approximately what file they want). No permanent UI. Ship this first and validate.

### Phase 2: File Tree Panel
For browsing and drag-to-insert. More UI surface area. Depends on the same IPC infrastructure as the palette, so Phase 1 lays the groundwork.

### Phase 3: Quick Peek
Nice-to-have. Depends on syntax highlighting library. Can be added to both palette and tree after they ship.

---

## Out of Scope

- File editing or creation
- File deletion or renaming
- Git status indicators on files (future feature, separate PRD)
- Terminal current-directory tracking (would require shell integration / OSC 7)
- File watching or live updates (tree refreshes on re-open or manual refresh)
- Full-text content search (grep across files) — different from filename search
- Diff viewer (covered separately in `next-features.md`)
