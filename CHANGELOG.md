# Changelog

All notable changes to Clave are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versions use [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- The Git panel no longer spikes CPU when opened on a very large folder (e.g. your home directory or the filesystem root). Repo discovery is now bounded and cached: it skips system and dependency directories, finds repos breadth-first so shallow repos surface quickly, stops cleanly on huge trees instead of crawling everything, and reuses earlier scans — opening a subfolder of an already-scanned folder costs nothing, and scanning a parent reuses what it already knows about its children. Status and fetch updates run with a capped number of parallel git calls, and in folders with many repos (50+) live polling is paused in favor of a manual Refresh, shown in a small banner. The Git panel only does this work while it's open.
- Sessions now come back after a reboot, not just after quitting and reopening. Persistent (tmux) sessions live in a background process that a shutdown or restart kills, so previously they were lost on the next launch. Clave now keeps each session's details on disk and, when it finds the tmux process gone, re-opens the tabs in their original folders automatically. Claude Code sessions also resume their previous conversation.

## [1.50.1] — 2026-06-06

### Fixed
- Groups now survive quitting and reopening Clave. Previously, when persistent (tmux) sessions reattached on launch, the sessions came back but their groups were lost — a group's sessions and attached terminals reappeared loose in the sidebar. Groups (with their names, colors, terminals, and ordering) are now saved to disk and restored around the reattached sessions, surviving a crash or force-quit as well as a normal quit.

## [1.50.0] — 2026-06-06

### Added
- **Claude Code accounts** — run sessions under different Claude accounts side by side. Define named accounts in Settings → Claude Code accounts, each pointing at its own config directory, and once you have more than one a picker appears when you start a Claude session (hover Claude Code / Claude Agents in the New Session menu). The keyboard shortcuts use your selected default account, and each session's header shows which account it's running under. New accounts start signed out — the first session on one runs Claude's normal login. With a single account, nothing changes.

## [1.49.0] — 2026-06-05

### Added
- **Persistent sessions (tmux)** — sessions now run inside a tmux session, so your agents keep running after you quit Clave, survive crashes, and reattach automatically on the next launch. They're also reachable from any terminal with `tmux -L clave attach`. On by default when tmux is installed (sessions fall back to normal otherwise); you can turn it off in Settings → Sessions.

## [1.48.0] — 2026-06-05

### Added
- Claude Code session tabs now show their live status at a glance: the icon turns blue and pulses while Claude is **working**, an amber dot appears when Claude is **blocked** waiting for your input (a permission or selection prompt), and a green dot marks a session that **finished while you were away** — clearing as soon as you open the tab. Idle and freshly-started sessions stay clean. Status is driven by Claude Code's own lifecycle signals, so it's accurate rather than guessed. Gemini and Codex sessions stay neutral for now (see ROADMAP.md).

## [1.47.1] — 2026-06-04

### Fixed
- Screenshots dragged into a session straight from the macOS preview thumbnail are now copied into stable storage on drop, so the agent can still read them after macOS removes the original temporary file. Old copies are cleaned up automatically after 7 days.

## [1.47.0] — 2026-06-04

### Added
- New **Claude Agents** session type that launches `claude agents` instead of plain Claude Code — available from the New Session menu and with the **⌘⇧A** shortcut
- The three Claude session types are now distinguishable at a glance in the sidebar: a faint trailing glyph marks **Claude Agents** (bolt) and **skip-permissions** (shield) sessions, while plain **Claude Code** stays unmarked — the Claude logo itself is left clean

## [1.46.0] — 2026-06-04

### Changed
- Redesigned the remote agent conversation view: your messages now sit in a clean rounded bubble, the agent's replies flow as plain text for easier reading, and the whole thread is centered in a comfortable reading column
- New message composer with a rounded input and a circular send button that blends into the conversation background for a calmer, more focused look

## [1.45.1] — 2026-06-04

### Changed
- Remote sessions now show their provider's logo in the sidebar (Claude Code, Gemini, Codex, or terminal) instead of a generic globe — the server-name badge already marks them as remote, so they now read just like local sessions
- The remote file tree now matches the local file tree's design — same row height, spacing, icons, and font size
- Refreshed the remote folder picker (shown when opening a session on a remote server) with a cleaner layout, Up and Home shortcuts, an editable breadcrumb path, keyboard navigation, and polished folder rows

### Fixed
- The remote server-name badge in the sidebar no longer crops longer names at a fixed width — it now grows to fit and truncates with an ellipsis, with the full name on hover

## [1.45.0] — 2026-06-03

### Changed
- Sidebar sessions now show their provider's actual logo — Claude Code, Gemini, and Codex sessions each display their brand mark instead of a generic icon. Claude sessions use the Claude logo whether or not permissions are skipped, and plain terminals keep the terminal icon

## [1.44.0] — 2026-06-03

### Changed
- The **Settings** page is now centered for a more balanced layout that matches the rest of the app
- Polished the **Settings** page to match the rest of the app — consistent buttons, fonts, inputs, and list rows (the **Add Location** and **Add Workspace** buttons now look identical)

### Fixed
- The **Git** panel now names the parent repository when the folder you opened isn't itself a git repository, so it's clear why changes from outside that folder appear
- Opening the **Add Location** dialog now dims the whole window, including the **Git** panel, instead of leaving it bright

### Removed
- Removed the **App Icon** picker from Settings (only one icon was ever applied)
- Removed the **Launch Templates** feature — use `.clave` workspace files and session templates instead

## [1.43.1] — 2026-06-02

### Changed
- The **Sessions** header's templates button now uses a tiles-with-plus icon instead of a folder-plus icon, so it reads as "launch from a template" rather than "add a folder"

## [1.43.0] — 2026-06-02

### Added
- Files now open in a real code editor — syntax-highlighted **and** editable the moment they open, with no separate "Edit" step. Just click into the code, type, and press ⌘S to save. Highlighting now follows your theme (dark, light, and coffee), so code looks at home instead of washed out
- Markdown files open rendered, with a **Preview / Source** toggle to edit the raw text

### Changed
- The file preview panel and the file tab now share one editor, so they look and behave the same everywhere
- When a file is open in a tab, the path row shows a live save-status indicator — a **Save** button (with the ⌘S hint) while you have unsaved edits, and **Saved** once it's up to date — instead of a separate Save button above the file
- Closing the preview panel while you have unsaved edits now asks before discarding them, instead of silently dropping the changes

## [1.42.2] — 2026-06-01

### Fixed
- Right-clicking an open file in the sidebar now shows icons next to **Copy Path** and **Reveal in Finder**, matching the other items in the menu and the rest of the app

## [1.42.1] — 2026-05-29

### Fixed
- The session templates grid no longer randomly reappears in the sidebar after dragging a file in and out — the file-drop target now reliably disappears once a drag ends

## [1.42.0] — 2026-05-27

### Added
- Session templates (your `.clave` workspaces) now open from a **folder-plus icon** next to the **Sessions** header, in a searchable popover — so having lots of templates no longer pushes your session list down the sidebar. Click a template to launch it; active ones stay highlighted. You can still drag a group or drop a `.clave` file onto the sidebar to pin a new one

### Changed
- The templates popover, the **New session** menu, and the user menu now open just to the right of the sidebar divider, and the Sessions header's action icon lines up with the row icons below it

## [1.41.1] — 2026-05-26

### Changed
- The file action buttons in the preview panel (open in tab, open externally, edit, copy path, close) and every option in the file right-click menu now use the same Heroicons as the rest of the app, so the file panels look consistent with the session menus

### Fixed
- Right-click menus no longer get cropped near the screen edge — they now open leftward when close to the right edge and upward when close to the bottom

## [1.41.0] — 2026-05-26

### Added
- **Codex CLI** sessions — launch OpenAI's Codex CLI straight from the New session menu (or press Cmd+U), the same way you start Claude Code or Gemini CLI. Codex sessions get their own OpenAI mark in the menu and a chip-style icon in the sidebar, and they're remembered in pinned groups, templates, and `.clave` workspace files
- The file tree now shows distinct icons for more file types: spreadsheets and tables (`.csv`, `.tsv`, `.xls`, `.xlsx`), `LICENSE`, `.gitignore`, `.json`, `.yml`/`.yaml`, `README.md`, and files with no extension each get their own icon instead of the generic document

### Changed
- The **New session** menu now opens to the right of the New session tab instead of dropping straight down, matching how the user menu in the sidebar footer opens

## [1.40.0] — 2026-05-25

### Added
- When you select a session, group, or file tab in the sidebar, the unselected rows now fade back so your active selection stands out by contrast. Dragging still takes visual priority over the fade
- The help docs now cover **Gemini CLI** sessions (Cmd+I) — the shortcut, the session type, and its star icon are documented alongside Claude Code, Terminal, and Dangerous mode

### Removed
- Dropped the stale **Cmd+F "Focus sidebar search"** entry from the shortcuts help — the sidebar search box was removed in 1.39.0, so the shortcut no longer exists

## [1.39.0] — 2026-05-25

### Changed
- The sidebar has been reorganized for a cleaner, more consistent layout. **New session** (now a pencil-square tab) and **Queue** sit at the top as permanent tabs, your sessions live under a single **Sessions** header, and pinned groups appear inline beneath it. Tab heights, row spacing, leading/trailing icon padding, and corner roundness are now driven by shared design tokens, so rows line up and the whole app feels a touch tighter and less round. Group and pinned cards align to the same width as normal tabs, and a selected tab inside a group no longer looks like it touches the card border
- The sidebar search box and the reset button were removed from the top of the sidebar

### Removed
- The **model-info pill** and the **context-inventory pill** in the terminal header have been removed. These started as a community contribution, and we're grateful for it — the removal is not a judgment on the work. Claude Code now reports the same information natively in its own statusline (active model, reasoning effort, thinking, context-window size and the live context-fill percentage), so the pills duplicated what CC already shows. The context-inventory pill in particular could mislead: it estimated a static footprint of your config files against a guessed context window (often 200k even on 1M-context models), whereas CC's statusline reports true live usage against the real window. To let CC's native statusline show through, Clave no longer injects its own `statusLine` hook into sessions — your configured statusline (or CC's default) now appears directly, unmodified
- The **Daily Log** sidebar widget (the per-project session journal with daily/AI summaries) has been removed, along with its Settings toggles and the background session-summarization it ran. It watched every session lifecycle change and summarized completed sessions, costing CPU for a feature that did not work reliably. The matching Settings options and help docs are gone too
- The **History** sidebar section and panel (browse/search past Claude Code conversations) has been removed, along with the underlying transcript reader and IPC. It overlapped with browsing your sessions directly, and the conversation transcripts remain on disk under `~/.claude` for any external tooling that wants them

## [1.38.1] — 2026-05-22

### Fixed
- Gemini CLI session tabs now use a clean star icon that matches the other tab icons, instead of the previous heavy custom glyph that looked out of place and garbled at small sizes

## [1.38.0] — 2026-05-15

### Added
- The Git panel now shows a **Publish Branch** button when you're on a branch that has no upstream — committing on a new local branch used to look silent because the Push button only appeared when `ahead > 0` relative to a remote, which an unpublished branch never has. The Publish Branch button replaces Push in that state, shows the unpublished commit count, and runs `git push -u origin <branch>` so the branch is tracked from then on

## [1.37.3] — 2026-05-15

### Fixed
- Claude Code's welcome banner now renders at full width when you spawn a session, instead of appearing as a mangled sliver. The PTY used to be born at a fixed 80×24, so the welcome banner was laid out for 80 columns and then garbled when xterm reflowed to your actual terminal width. The PTY now waits until the terminal has measured itself before starting Claude, so the banner is laid out for the real width from the start
- Your custom `statusLine` from `~/.claude/settings.json` is now preserved inside Clave sessions — Clave's own status hook used to override it entirely, hiding the context-fill bar and any other bottom-bar metadata you'd configured. Clave now chains the user's statusLine command through its hook so both Clave's pills and your own bottom-bar appear
- The bash interactive prompt, macOS "default shell is now zsh" notice, and the echoed `claude …` command no longer flash on screen at session start — Claude is now exec'd directly by a non-interactive shell

## [1.37.2] — 2026-05-11

### Fixed
- Terminal text no longer gets duplicated, truncated, or mojibaked when you toggle the sidebar / file tree or view sessions side-by-side — Framer Motion's panel animation used to fire dozens of SIGWINCH signals to the PTY during a single resize, causing Claude Code to repaint the conversation into the scrollback over and over. The PTY now receives exactly one resize at the settled size, so the conversation stays readable and scrollback isn't bloated with duplicates

## [1.37.1] — 2026-05-04

### Added
- Cmd+Z in the sidebar now undoes the last group/move/rename/recolor action — accidentally disbanding a group or dragging a session into the wrong place is no longer permanent

## [1.37.0] — 2026-05-03

### Added
- Windows installer is now built and attached to every GitHub Release automatically — Windows users can download a `.exe` setup alongside the macOS `.dmg`/`.zip`

## [1.36.1] — 2026-04-24

### Fixed
- Model / effort / context pills now appear in the packaged app — the statusLine hook script was looked up at the wrong path inside the bundle, so the hook never registered and the pills stayed empty (they only worked in `npm run dev`)

## [1.36.0] — 2026-04-24

### Added
- Model pill in the terminal header surfaces the active Claude Code model (e.g. "Opus 4.7") at a glance — click it to open a popover with the full session config: raw model id, reasoning effort, thinking on/off, fast mode, context window size, output style, agent, and live session cost
- All values stay live via Claude Code's documented `statusLine` hook, so running `/model`, `/effort`, or `/fast` inside the session updates the pill on the next status refresh

### Fixed
- Context Inventory now reports usage against the real 1M context window on extended-context sessions instead of clipping at 200k

## [1.35.7] — 2026-04-23

### Fixed
- File tree no longer collapses all open folders when you switch to the Git tab and back — expansion and filter state now survive the round-trip
- Terminal no longer gets left in a cramped or mis-sized state when opening or closing the file tree, git panel, or sidebar — the final fit now waits for the panel animation to settle and refreshes the viewport to clear any leftover glyphs

## [1.35.6] — 2026-04-22

### Fixed
- Save discussion now finds the right transcript even after `/clear`, `/compact`, or `/resume` rotates Claude's session UUID — it falls back to matching by the session id recorded inside the JSONL, then to the most recently modified JSONL in the project folder
- Save discussion and Save plan now show a clear error dialog when the transcript can't be found, instead of silently doing nothing
- Save discussion and Save plan now work for remote Claude sessions — the transcript is fetched from the remote host over SFTP instead of being looked up only on the local disk

## [1.35.5] — 2026-04-20

### Added
- Multi-repo git panel: hovering a repo name for ~2 seconds reveals a tooltip with the shortened full path, making it easy to tell apart repos with the same name

## [1.35.4] — 2026-04-17

### Fixed
- Generate commit message now retries once on transient failures and falls back to Sonnet when Haiku is overloaded, so the "Command failed" error that appeared ~50% of the time should be much rarer
- Commit message generator now surfaces the real underlying error (including stderr) when the Claude CLI fails, instead of a truncated generic message
- Bumped the commit message generation timeout from 30s to 60s to cover slower Haiku responses

## [1.35.1] — 2026-04-16

### Fixed
- Generate commit message no longer fails when changes are already staged — previously it tried to re-stage all files including already-staged ones, causing pathspec errors on renamed or moved files

## [1.35.0] — 2026-04-14

### Fixed
- Context Inventory popover no longer flashes to the top-left corner when you open a new session (Cmd+T / Cmd+D) with the popover open — it now vanishes cleanly as the session hides

## [1.34.3] — 2026-04-14

### Fixed
- Context Inventory popover no longer closes when you click inside it (e.g. expanding Skills or Agents) — removed an over-eager window-blur handler that was firing on focus transitions between the terminal and the popover

## [1.34.2] — 2026-04-14

### Fixed
- Context Inventory no longer shows the same plugin, skill, or command multiple times — it now reads the active install list from `~/.claude/plugins/installed_plugins.json` instead of walking every cached version on disk, and honours `enabledPlugins` plus local-scope `projectPath` so only plugins Claude Code would actually load for the current session are counted

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
