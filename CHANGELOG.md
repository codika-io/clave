# Changelog

All notable changes to Clave are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versions use [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.34.1] — 2026-04-14

### Fixed
- Context Inventory popover no longer drifts to the top-left of the screen when switching sessions or opening a new Clave window — it now closes automatically when its session is hidden or the window loses focus
- Close (×) button on the Context Inventory popover now reliably dismisses it

## [1.34.0] — 2026-04-14

### Added
- **Context Inventory popover** per session — click the database icon in the terminal header to see what Claude Code loads at session start (CLAUDE.md chain, skills, plugins, commands, agents, MCP servers, hooks, project memory) with estimated token cost and percentage of the context window
- Always-on percentage badge next to the inventory icon so you can see your context fill at a glance without opening the popover (subtle under 40%, amber at 40–70%, red at 70%+)
- Stacked category bar and colored legend at the top of the popover, making it instantly obvious which bucket is dominating your context
- Per-row proportional fill bars inside each category so the heaviest entries stand out without having to read numbers
- Info tooltip in the popover with quick tips for reducing context (`/plugin`, `/clear`, `/compact`, `~/.claude/settings.json`)
- In-app help page (Help → "Context Inventory") explaining what's measured, what isn't (e.g. MCP runtime tool schemas), and the read-only design philosophy
- Addresses [issue #9](https://github.com/codika-io/clave/issues/9)

## [1.33.0] — 2026-04-14

### Changed
- Daily Log redesigned for at-a-glance readability: 7-day week strip with heatmap intensity, stat cards for time/sessions/projects, and a timeline view of entries coloured by project
- Entry cards get a unified card layout with clearer hierarchy — project chip, entry name, time range, and parsed summary with bullets
- New Timeline / By project toggle lets you switch between a flat chronological feed and the project-grouped view

## [1.32.6] — 2026-04-13

### Added
- Open git diffs as document tabs from the git panel — "Open as tab" button in the diff preview header, and a right-click "Open as tab" option on any changed file in the git tree
- Diff tabs live-update on stage/unstage and git refresh, and keep Stage/Unstage actions inline
- Same file can coexist as multiple tabs: file content, unstaged diff, staged diff, and per-commit diff

## [1.32.5] — 2026-04-11

### Fixed
- Announcements container (What's New / Update banners) no longer adds bottom padding when empty

## [1.32.4] — 2026-04-11

### Added
- Daily cost bar chart on the Usage page with Day, Week, and Month views
- Day view shows hourly cost breakdown (24 bars), replacing the old Activity by Hour grid
- Week and Month views show daily cost with navigation between periods
- Hover reveals exact cost per bar with smooth fade animation

### Changed
- Usage data now computes accurate daily cost from per-category token breakdowns (input, output, cache read, cache creation) instead of a single total
- Model breakdown component is now full-width

## [1.32.3] — 2026-04-10

### Changed
- Moved What's New and Update banners above the sidebar footer, appearing on top of sessions and the divider bar

## [1.32.2] — 2026-04-10

### Changed
- Usage panel: replaced 30-day bar chart with a GitHub-style contribution heatmap showing a full year of activity
- Heatmap uses percentile-based intensity levels with theme-aware accent colors

## [1.32.1] — 2026-04-10

### Changed
- Light theme refreshed with Linear-inspired warm grays instead of pure neutral grays
- Accent color updated from bright blue to Linear's indigo-violet (#5e6ad2)
- Color palette (profile avatars and group colors) replaced with muted, desaturated tones matching Linear's aesthetic

## [1.32.0] — 2026-04-10

### Changed
- Work tracker redesigned: merged into unified sidebar footer section as a single clickable line instead of a floating card
- Clicking the work tracker now navigates directly to the full Usage page
- Time tracking now shows wall-clock time instead of summing concurrent sessions independently

### Fixed
- Work tracker could show impossible values like "18 hours yesterday" due to a heuristic that multiplied message counts by 2 minutes
- Concurrent sessions inflated today's total (3 sessions for 1 hour showed 3h instead of 1h)

### Removed
- Yesterday summary, weekly chart, and token costs from the work tracker widget (available in the Usage page instead)

## [1.31.0] — 2026-04-10

### Added
- Design system: semantic CSS tokens for sidebar items, buttons, inputs, badges, and icon buttons in main.css
- History conversation view: chat bubble layout with user messages right-aligned and assistant messages left-aligned
- Conversation turn grouping: assistant messages and tool results merged into single visual blocks

### Changed
- Queue panel redesigned to match History list layout (centered content, hover rows, no dividers)
- Sidebar spacing tightened (4px gaps) and count badges removed from History and Daily Log tabs
- All buttons, inputs, badges, and icon buttons across 35 components now use shared design tokens
- Border radius standardized (icon buttons use rounded-md, dialogs use rounded-xl)
- Dialog footer buttons unified with btn-dialog class
- What's New banner relocated to sidebar

### Fixed
- Inconsistent spacing between sidebar items (session tabs vs activity tabs)
- Arbitrary shadow values replaced with design system tokens
- AddLocationDialog used rounded-2xl instead of rounded-xl like other dialogs

## [1.30.0] — 2026-04-10

### Added
- AI Journal: daily work tracker with smart session summaries powered by Claude Haiku
- Journal accessible from Activity section in sidebar, renders in full-width main content area

### Changed
- Help moved from side panel tab to standalone ? toggle button
- Side panel tabs (Files/Git) use consistent active state via effectiveTab

### Fixed
- WhatsNewBanner dismiss stored wrong version, causing banner to re-show
- will-navigate dev fallback matched all URLs when ELECTRON_RENDERER_URL unset
- setWindowOpenHandler now blocks non-HTTP schemes from shell.openExternal
- Toggle knob asymmetric padding on settings switches

## [1.29.0] — 2026-04-10

### Added
- Work Tracker widget with daily session stats, streaks, and weekly trends
- In-app help panel with searchable documentation (10 help topics)
- What's New banner for post-update feature announcements
- `clave://navigate` deep links in help docs to jump to features
- App version exposed to renderer via IPC

## [1.26.2] — 2026-04-03

### Added
- i18n with first-launch language picker
- History session browser with sidebar expansion
- Windows support

### Fixed
- History panel CJK copy bug, scroll-to-search, and markdown rendering
- Search bar placeholder text cleanup

## [1.26.0] — 2026-04-02

### Added
- History session browser with sidebar expansion

## [1.25.0] — 2026-04-02

### Added
- History viewer with full conversation display, markdown rendering, and search

## [1.24.0] — 2026-04-01

### Added
- Git Journey panel — visualize commit history grouped by push
- Improved git diff preview UX — single-click switching, arrow navigation, active highlight

### Changed
- Preserve folder expansion state on navigation, add back button

## [1.23.0] — 2026-03-31

### Fixed
- Show folder name instead of group name in toolbar server button

### Changed
- Reduced resource consumption for hidden terminals and fixed polling loops

## [1.22.0] — 2026-03-27

### Added
- Auto-discovery of `.clave` files from repos
- Category support for pinned groups
- Per-terminal cwd support for group terminals
- `workspaceId` for per-user `.clave` file override
- Save discussion and save plan buttons to session header

### Changed
- Rewrote session auto-naming to read Claude's JSONL transcript

## [1.21.0] — 2026-03-25

### Added
- Magic sync button in git panel
- Redesigned right sidebar layout and git panel structure
- Icon toggle buttons replacing segmented controls
- IconButton abstraction with harmonized tooltips
- Auto-remove localhost URL indicators when server stops
- Workspace discovery from root folder with rootDir path resolution

### Fixed
- Default AppIcon fill gradient corrected

## [1.20.0] — 2026-03-25

### Added
- Toolbar active URLs with darkened quick-action icons
- Pin buttons show logo with tooltip
- Logo and autoLaunchLocalhost support in `.clave` group config
- Toolbar quick-action buttons and workspace title
- Workspace management in Settings with auto-save
- Drag-drop `.clave` files into pin area with export dialog
- `.clave` file format — IPC handlers for read, write, watch, and path resolution

## [1.19.8] — 2026-03-24

### Added
- Smarter session auto-titles from extracted user messages
- Enhanced group terminals with folder picker, optional command, icon selection, right-click menu
- Keyboard shortcuts for sidebar, settings, search, and session navigation
