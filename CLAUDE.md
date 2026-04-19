# Clave

Mac desktop app for managing multiple Claude Code terminal sessions. Electron + React + TypeScript.

This repo also ships a Claude Code plugin marketplace at its root — `.claude-plugin/marketplace.json` + `plugins/` — so users can do `/plugin marketplace add codika-io/clave` to install clave-companion plugins (e.g. `workspace-builder`). See `plugins/CLAUDE.md` for the marketplace conventions.

## Commands

- `npm run dev` — start dev (Electron window + hot reload)
- `npm run build` — typecheck + build
- `npm run build:mac` — build + package macOS universal dmg + zip (signed + notarized)
- `npm run typecheck` — typecheck only
- `npm run lint` — eslint
- `npm run release -- --patch|--minor|--major` — non-interactive release (see `.claude/rules/release.md`)

## Architecture

Three-process Electron app:

- **Main** (`src/main/`): Electron window, node-pty, IPC handlers, domain managers. PTY spawns `/bin/zsh -l -c claude` per session. IPC handlers are split into modular files under `ipc-handlers/`.
- **Preload** (`src/preload/`): Typed `window.electronAPI` via contextBridge. All main↔renderer communication goes through IPC.
- **Renderer** (`src/renderer/src/`): React + Zustand + xterm.js + Tailwind v4 + Framer Motion.

## Conventions

- **Icons**: Use Heroicons (`@heroicons/react/24/outline`) for all UI icons. No hand-rolled SVGs for standard icons. Custom SVGs only for file-type icons in `components/files/file-icons.tsx`.
- **Themes**: Three themes (dark, light, coffee). CSS vars on `:root` / `[data-theme="light"]` / `[data-theme="coffee"]` in `main.css`. xterm has separate theme objects updated via `terminal.options.theme`.
- **Stores**: Zustand stores in `src/renderer/src/store/`. `session-store.ts` is the main one (sessions, groups, layout, theme).
- **Design system**: `main.css` defines semantic CSS classes (`sidebar-item`, `btn-primary`, `btn-secondary`, `btn-dialog`, `btn-icon`, `input-field`, `input-compact`, `badge`, etc.) that are the single source of truth for spacing, radius, shadows, and interactive states. All UI components must use these tokens instead of repeating inline Tailwind patterns. Never duplicate styling logic across components. When adding new UI, check `main.css` for an existing class first; if none fits, extend the design system with a new semantic class rather than inlining styles. The goal is visual coherence through a unified system where components inherit from the same parameters.

## Signing and notarization

Builds require Apple code signing. Credentials in `.env` (not committed):
- `CSC_LINK` — base64-encoded .p12 certificate
- `CSC_KEY_PASSWORD` — certificate password
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — for notarization

## Gotchas

- **PATH resolution in packaged app (CRITICAL)**: Packaged Electron apps have a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`). The user's full PATH must be resolved by spawning a login shell. **NEVER use `execSync`** — it goes through `/bin/sh` which expands `$PATH` before zsh starts. Always use `execFileSync('/bin/zsh', ['-lic', 'echo __PATH__$PATH'])` so zsh sources `.zprofile`/`.zshrc` first. This is the root cause of `command not found: claude` in packaged builds.
- **electron-updater targets**: Both `zip` and `dmg` targets are required in `electron-builder.yml` — zip for silent background updates, dmg for fresh installs.
- **Repo must be public** for electron-updater to check GitHub Releases without an auth token.
- **node-pty spawn-helper** needs +x permissions — handled by `postinstall` script.
- **No WebGL**: WebGL addon for xterm was removed (context loss issues) — canvas renderer only.
- **macOS traffic lights**: `trafficLightPosition: { x: 16, y: 16 }` with `hiddenInset` titlebar. Toolbar adds `pl-20` when sidebar is closed to avoid overlap.
- **Terminal fit**: ResizeObserver guards against zero-size during animations; `FitAddon.fit()` wrapped in try/catch.

## Rules

- When using the Playwright MCP server to take screenshots, always delete the screenshot files after you are done using them.
- After implementing UI or renderer changes, always verify them with the **Playwright Electron MCP** (not the regular Playwright MCP). This launches the real Electron app with full `window.electronAPI` support.
- **NEVER use `pkill`, `killall`, or broad process-matching commands** to kill test Electron instances — these will also kill the user's installed Clave app.

### Playwright Electron MCP — Verification workflow

Config: `.playwright-electron.config.json` (gitignored). Launches the built Electron app directly with an isolated `--user-data-dir` to avoid conflicts with the running installed Clave app. The engineering plugin's `.mcp.json` passes `--config .playwright-electron.config.json` so this file is actually loaded by the MCP server.

1. Build: `npx electron-vite build` (compiles to `out/`)
2. Load tools: `ToolSearch` for `+playwright-electron`
3. Launch: `electron_first_window`
4. Inspect: `browser_snapshot`, `browser_click`, `browser_console_messages`
5. Cleanup: `browser_close`, then delete any screenshot files

The regular `playwright` MCP opens `localhost:5173` in Chrome where `window.electronAPI` is undefined — useless for testing Electron features.
