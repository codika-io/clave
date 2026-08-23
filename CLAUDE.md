# Clave

Mac desktop app for managing multiple coding-agent CLI sessions in parallel. Provider-agnostic: it orchestrates Claude Code (Cmd+N), Antigravity CLI (Cmd+I), and Codex CLI (Cmd+U) sessions side by side, plus plain terminals (Cmd+T) and remote agents over OpenClaw. Electron + React + TypeScript.

Clave's companion agent plugin (`clave`, exposing `/clave:create-workspace` and `/clave:recover-sessions`) ships from `plugin/` in this repo — see `plugin/CLAUDE.md`. It is installed with `npx plugins add codika-io/clave`, resolved through `.claude-plugin/marketplace.json` at the root. The Electron app reads installed plugins from `~/.claude/plugins/` at runtime and never reads `plugin/` directly; the folder is here so a `.clave` format change and the skill that describes it land in the same commit (see the schema sync rule below).

## Commands

- `npm run dev` — start dev (Electron window + hot reload)
- `npm run build` — typecheck + build
- `npm run build:mac` — build + package macOS universal dmg + zip (signed + notarized)
- `npm run typecheck` — typecheck only
- `npm run lint` — eslint
- Releases ship via CI on push to `prod` (bump from a `[minor]`/`[major]` commit-message marker, else patch) — see `.claude/rules/release.md`. `npm run release -- --patch|--minor|--major` remains the local fallback.

## Architecture

Three-process Electron app:

- **Main** (`src/main/`): Electron window, node-pty, IPC handlers, domain managers. PTY spawns `/bin/zsh -l -c claude` per session. IPC handlers are split into modular files under `ipc-handlers/`.
- **Preload** (`src/preload/`): Typed `window.electronAPI` via contextBridge. All main↔renderer communication goes through IPC.
- **Renderer** (`src/renderer/src/`): React + Zustand + xterm.js + Tailwind v4 + Framer Motion.

## Conventions

- **Icons**: Use Heroicons (`@heroicons/react/24/outline`) for all UI icons. No hand-rolled SVGs for standard icons. Custom SVGs only for file-type icons in `components/files/file-icons.tsx`.
- **`.clave` schema sync rule**: the schema is mirrored in **six** places that do NOT import each other. When you change an enum — or add, rename, or remove ANY `.clave` field — all six move in the same change:
  1. `src/renderer/src/store/session-types.ts` — the renderer types (`GroupTerminalIcon`, `TERMINAL_COLOR_VALUES`, `PinnedGroup`, `PinnedGroupSession`, `PinnedGroupTerminal`, `SessionGroup`).
  2. `src/main/ipc-handlers/clave-trust.ts` — the file shape (`ClaveGroupData`, `ClaveFileReadResult`) **and the trust boundary**, `describeElevated` / `sanitizeElevated`. Any field that can drive an agent — a prompt, an auto-run command, a permissions flag — must be added to BOTH functions or an untrusted `.clave` gets it past the review dialog with no symptom at all. This is the security-critical mirror; `clave-trust-boundary.test.ts` is the test that must grow with it.
  3. `src/main/ipc-handlers/clave-file-handlers.ts` — the main-process parser and writer (`ClaveFileRaw`, `ClaveFileWriteData`, `resolveGroup`, `serializeGroup`), plus the wiring that decides whether to consult the trust boundary at all (`isUnderTrustedRoot`, the elevated check, the dialog answers).
  4. `src/preload/index.d.ts` — the typed IPC boundary (`ClaveFileGroupData`, `ClaveFileWriteData`). Easy to miss because nothing references it by name, and the read path silently loses the field if it lags.
  5. `src/main/mcp/mcp-server.ts` — the MCP tool schemas agents call.
  6. `plugin/skills/create-workspace/SKILL.md` — the reference agents author `.clave` files from. A stale skill fails silently: it keeps writing the field you renamed, and the `.clave` still parses. It used to live in a separate repo and need its own PR; it is in this repo precisely so it can go in the same commit as the other five.

  Then check the round-trip, which is where a new field actually goes missing: `resolveGroup` (read), the sync writer and `exportClaveFile` in `pinned-store.ts` (write), `createPinnedFromGroup` AND `pinGroupFromCurrent` (both directions of pin ↔ live group), and **both single-group normalisations in `pinned-store.ts`** — one in `importClaveFile`, one in the file watcher's reload, each rebuilding the object field by field. They are easy to mistake for one another: during PRDCT-1665 the import copy dropped a new field twice, and the watcher copy dropped it in a way that made a `.clave` edit never hot-reload.

  Nothing here fails loudly. Unknown icons fall back to the default, unknown colors render colorless, and a dropped field simply is not there — the feature demos perfectly in the UI and does nothing. Verify a new field by inspecting the spawned process or the written file, not the rendering.
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

**A verification script MUST be able to fail.** Assert and exit non-zero; a script that prints JSON for a human to read and exits 0 unconditionally is a probe, not a check, and it verifies nothing the moment nobody is reading. The test: mutate the behaviour the script covers, re-run it, and confirm it goes red. If it stays green, the script is decoration. This is not hypothetical — PRDCT-1663/1664/1665 shipped seven print-only scripts that survived 9 of 9 targeted mutations, including one that disabled prompt sanitization for untrusted `.clave` files, and two of them had been broken since the commit was written because they selected a `title` that same commit deleted.

If the Playwright Electron MCP is unavailable (see PRDCT-1669 — its config is gitignored, so a fresh clone or worktree has none and the server exits before registering a tool), drive the app directly with Playwright's `_electron` API: `electron.launch({ executablePath: 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron', args: ['.', '--user-data-dir=<isolated>'], cwd: <repo> })`. Same fidelity — real Electron, real `window.electronAPI`.
