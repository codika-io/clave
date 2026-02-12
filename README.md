# Clave

A macOS desktop app for managing multiple Claude Code terminal sessions from a single window.

Built with Electron, React, TypeScript, xterm.js, and Tailwind CSS v4.

## Features

- **Multi-session management** — Open multiple Claude Code sessions side-by-side
- **Flexible layouts** — Single, split (2-panel), or grid (4-panel) modes
- **Searchable sidebar** — Filter sessions by name, folder, or path
- **Inline rename** — Double-click, right-click, or press Enter to rename sessions
- **Resizable sidebar** — Drag the divider to adjust sidebar width
- **Dark / Light themes** — Polished theming for both terminal and UI
- **Native macOS integration** — Hidden inset titlebar with traffic light controls

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
# macOS (.dmg)
npm run build:mac
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev (Electron + hot reload) |
| `npm run build` | Typecheck + build |
| `npm run build:mac` | Build + package macOS dmg |
| `npm run typecheck` | Typecheck only |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Architecture

- **Main process** (`src/main/`) — Electron window, node-pty management, IPC handlers. Each session spawns `/bin/zsh -l -c claude` via PTY.
- **Preload** (`src/preload/`) — Typed `window.electronAPI` via contextBridge. All PTY communication goes through IPC.
- **Renderer** (`src/renderer/src/`) — React UI with Zustand state, xterm.js terminals, Tailwind v4, Framer Motion.

### Key files

| File | Purpose |
|---|---|
| `src/main/pty-manager.ts` | PTY lifecycle (spawn/write/resize/kill) |
| `src/main/ipc-handlers.ts` | IPC bridge between main and renderer |
| `src/renderer/src/store/session-store.ts` | Zustand store (sessions, layout, theme) |
| `src/renderer/src/hooks/use-terminal.ts` | xterm.js + FitAddon + PTY wiring |
| `src/renderer/src/components/layout/AppShell.tsx` | Main layout with resizable sidebar |
| `src/renderer/src/assets/main.css` | Tailwind v4 theme (CSS custom properties) |

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [xterm.js](https://xtermjs.org/) — terminal emulator
- [node-pty](https://github.com/microsoft/node-pty) — PTY process management
- [Zustand](https://zustand.docs.pmnd.rs/) — state management
- [Tailwind CSS v4](https://tailwindcss.com/) — styling
- [Framer Motion](https://motion.dev/) — animations
