# Clave

Mac desktop app for managing multiple Claude Code terminal sessions. Electron + React + TypeScript.

## Commands

- `npm run dev` — start dev (Electron window + hot reload)
- `npm run build` — typecheck + build
- `npm run build:mac` — build + package macOS dmg
- `npm run typecheck` — typecheck only
- `npm run lint` — eslint

## Architecture

- **Main process** (`src/main/`): Electron window, node-pty management, IPC handlers. PTY spawns `/bin/zsh -l -c claude` per session.
- **Preload** (`src/preload/`): Typed `window.electronAPI` via contextBridge. All PTY communication goes through IPC.
- **Renderer** (`src/renderer/src/`): React UI with Zustand state, xterm.js terminals, Tailwind v4, Framer Motion.

## Key files

- `src/main/pty-manager.ts` — PTY lifecycle (spawn/write/resize/kill)
- `src/main/ipc-handlers.ts` — IPC bridge between main and renderer
- `src/renderer/src/store/session-store.ts` — Zustand store (sessions, layout, theme)
- `src/renderer/src/hooks/use-terminal.ts` — xterm.js + FitAddon + PTY wiring
- `src/renderer/src/assets/main.css` — Tailwind v4 `@theme` with CSS custom properties for dark/light

## Gotchas

- node-pty's `spawn-helper` binary needs +x permissions — handled by `postinstall` script
- WebGL addon for xterm was removed (context loss issues) — use canvas renderer only
- macOS traffic lights: `trafficLightPosition: { x: 16, y: 16 }` with `hiddenInset` titlebar. Toolbar adds `pl-20` when sidebar is closed to avoid overlap.
- Terminal fit: ResizeObserver guards against zero-size during animations; `FitAddon.fit()` wrapped in try/catch
- Theme: CSS vars on `:root` (dark) / `[data-theme="light"]`, synced via `document.documentElement.setAttribute`. xterm has separate theme objects updated via `terminal.options.theme`.
