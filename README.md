# Clave

**A macOS desktop app for managing multiple Claude Code sessions from a single window.**

<p align="center">
  <img src="assets/demo.gif" alt="Clave demo" width="800" />
</p>

## Download

Get the latest release from [GitHub Releases](https://github.com/codika-io/clave/releases/latest). Download the `.dmg`, drag to Applications, done.

Auto-updates are built in — once installed, new versions download silently in the background.

## Why

Claude Code is great in a single terminal. But real work often means juggling multiple sessions across different projects. Clave gives you a dedicated app for that: open as many sessions as you need, arrange them side-by-side, and switch between them instantly.


## Features

- **Multi-session management** — Open unlimited Claude Code sessions, each in its own PTY
- **Flexible layouts** — Single, split (2-panel), or grid (4-panel) view modes
- **Searchable sidebar** — Filter sessions by name, folder, or path
- **Session naming** — Double-click or right-click to rename any session
- **Dark / Light themes** — Full theming for both terminal and UI
- **Native macOS feel** — Hidden inset titlebar with traffic light controls
- **Auto-updates** — New versions install automatically on quit via `electron-updater`
- **Signed & notarized** — Passes macOS Gatekeeper without warnings

## Requirements

- macOS (Apple Silicon or Intel)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Build from source

```bash
git clone https://github.com/codika-io/clave.git
cd clave
npm install
npm run dev          # development with hot reload
npm run build:mac    # build macOS .dmg (requires signing credentials)
```

## Tech stack

[Electron](https://www.electronjs.org/) &middot; [React 19](https://react.dev/) &middot; [TypeScript](https://www.typescriptlang.org/) &middot; [xterm.js](https://xtermjs.org/) &middot; [node-pty](https://github.com/microsoft/node-pty) &middot; [Zustand](https://zustand.docs.pmnd.rs/) &middot; [Tailwind CSS v4](https://tailwindcss.com/) &middot; [Framer Motion](https://motion.dev/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting bugs, suggesting features, and submitting pull requests.

## License

[MIT](LICENSE)
