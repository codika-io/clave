# Clave

Mac desktop app for managing multiple Claude Code terminal sessions. Electron + React + TypeScript.

## Commands

- `npm run dev` — start dev (Electron window + hot reload)
- `npm run build` — typecheck + build
- `npm run build:mac` — build + package macOS universal dmg + zip (signed + notarized)
- `npm run typecheck` — typecheck only
- `npm run lint` — eslint
- `npm run release` — interactive release: bump version, build, tag, publish to GitHub Releases

## Architecture

- **Main process** (`src/main/`): Electron window, node-pty management, IPC handlers. PTY spawns `/bin/zsh -l -c claude` per session.
- **Preload** (`src/preload/`): Typed `window.electronAPI` via contextBridge. All PTY communication goes through IPC.
- **Renderer** (`src/renderer/src/`): React UI with Zustand state, xterm.js terminals, Tailwind v4, Framer Motion.

## Key files

- `src/main/pty-manager.ts` — PTY lifecycle (spawn/write/resize/kill)
- `src/main/ipc-handlers.ts` — IPC bridge between main and renderer
- `src/main/auto-updater.ts` — electron-updater integration (auto-download, native OS notification)
- `src/renderer/src/store/session-store.ts` — Zustand store (sessions, layout, theme)
- `src/renderer/src/hooks/use-terminal.ts` — xterm.js + FitAddon + PTY wiring
- `src/renderer/src/assets/main.css` — Tailwind v4 `@theme` with CSS custom properties for dark/light
- `scripts/release.sh` — release automation script

## Release process

Distribution: GitHub Releases on the public repo `codika-io/clave`. Existing users get auto-updates via `electron-updater`.

### How to release

1. Make sure all changes are committed and pushed to `main`.
2. Run `npm run release`.
3. The script will prompt for a version bump (`patch`, `minor`, `major`, or explicit semver like `1.2.3`).
4. It bumps `package.json`, runs `npm run build:mac` (sources `.env` for signing credentials), verifies artifacts, then asks for confirmation.
5. On confirmation: commits the version bump, creates an annotated git tag `vX.Y.Z`, pushes to origin, and creates a GitHub Release with the DMG, ZIP, `latest-mac.yml`, and blockmap.

### Build artifacts

`npm run build:mac` produces in `dist/`:
- `clave-X.Y.Z.dmg` — universal (Intel + Apple Silicon) installer
- `clave-X.Y.Z-mac.zip` — universal zip (used by electron-updater for silent updates)
- `latest-mac.yml` — update manifest consumed by electron-updater
- `clave-X.Y.Z.dmg.blockmap` — differential download metadata

### Auto-updater behavior

- Configured in `src/main/auto-updater.ts`, called from `src/main/index.ts`.
- Only runs when `app.isPackaged` is true (no-op in dev via `npm run dev`).
- Checks for updates 5 seconds after app launch.
- Downloads updates silently in the background.
- Shows a native macOS notification when an update is downloaded: "Version X.Y.Z will be installed on next restart."
- Installs automatically on app quit.
- The updater reads `publish` config from `electron-builder.yml` (provider: github, owner: codika-io, repo: clave). The repo must be public for token-free update checks.

### Signing and notarization

The build requires Apple code signing. Credentials are expected in `.env` (not committed):
- `CSC_LINK` — base64-encoded .p12 certificate
- `CSC_KEY_PASSWORD` — certificate password
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — for notarization

`electron-builder.yml` has `notarize: true` under `mac`.

### Testing a build locally

1. Run `npm run build:mac`.
2. Open `dist/clave-X.Y.Z.dmg`, drag to Applications, launch.
3. Check Console.app for `[updater] App is up to date` (or `[updater] Error:` if no release exists yet).

### Testing the full release cycle

1. Release version N via `npm run release`.
2. Install version N-1 from a previous DMG.
3. Launch — the app should detect version N, download it, and show a native notification.
4. Quit and relaunch — the app should now be on version N.

## Gotchas

- **PATH resolution in packaged app (CRITICAL)**: Packaged Electron apps have a minimal `process.env.PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`). The user's full PATH (with homebrew, npm globals, etc.) must be resolved by spawning a login shell. `getLoginShellPath()` in `pty-manager.ts` handles this. **NEVER use `execSync` for this** — it runs through `/bin/sh` which expands `$PATH` before zsh starts, giving the minimal PATH. Always use `execFileSync('/bin/zsh', ['-lic', 'echo __PATH__$PATH'])` to call zsh directly so `$PATH` is expanded after zsh sources `.zprofile`/`.zshrc`. This is the root cause of `command not found: claude` in packaged builds.
- electron-updater requires both a `zip` and `dmg` target in `electron-builder.yml` — the zip is used for silent background updates, the dmg is for fresh installs.
- The repo must be public for electron-updater to check GitHub Releases without an auth token.
- node-pty's `spawn-helper` binary needs +x permissions — handled by `postinstall` script
- WebGL addon for xterm was removed (context loss issues) — use canvas renderer only
- macOS traffic lights: `trafficLightPosition: { x: 16, y: 16 }` with `hiddenInset` titlebar. Toolbar adds `pl-20` when sidebar is closed to avoid overlap.
- Terminal fit: ResizeObserver guards against zero-size during animations; `FitAddon.fit()` wrapped in try/catch
- Theme: CSS vars on `:root` (dark) / `[data-theme="light"]`, synced via `document.documentElement.setAttribute`. xterm has separate theme objects updated via `terminal.options.theme`.

## Rules

- When using the Playwright MCP server to take screenshots, always delete the screenshot files after you are done using them. Do not leave screenshot files in the repository.
- After implementing UI or renderer changes, always verify them with Playwright MCP: start `npm run dev`, navigate to the renderer URL (check dev server output for the port), take a snapshot, and check console for errors. This catches runtime issues that typecheck alone misses (e.g. missing guards for `window.electronAPI` which is only available inside Electron, not in a plain browser).
