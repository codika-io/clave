# Changelog

All notable changes to Clave are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versions use [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
