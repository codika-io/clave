<div align="center">

<img width="80" height="80" alt="Clave" src="resources/icon.png" />

**Clave is a macOS desktop app for managing multiple Claude Code sessions.**

Open as many sessions as you need, arrange them side-by-side, and switch between them instantly.

[Features](#features) · [Download](#download) · [Build from Source](#build-from-source) · [Contributing](#contributing)

</div>

<p align="center">
  <img src="assets/demo.avif" alt="Clave demo" width="800" />
</p>

---

## Download

[**Download the latest version**](https://github.com/codika-io/clave/releases/latest) (macOS Universal — Apple Silicon & Intel) · [All releases](https://github.com/codika-io/clave/releases)

Download the `.dmg`, drag to Applications, done.

Auto-updates are built in — once installed, new versions download silently in the background.

## Agent plugin

Clave ships a companion agent plugin ([`codika-io/clave-plugin`](https://github.com/codika-io/clave-plugin)) that lets any Claude Code / Cursor / Open-Plugin-compatible agent generate `.clave` workspace files for you.

```bash
npx plugins add codika-io/clave-plugin
```

Then ask your agent something like *"create a clave workspace for this repo with 3 sessions"* and it writes the `.clave` file for you to open in Clave.

## Features

- **Multi-session management** — Open unlimited Claude Code sessions, each in its own PTY
- **Session types** — Claude Code (Cmd+N), plain terminal (Cmd+T), or Dangerous Mode (Cmd+D, runs with `--dangerously-skip-permissions`)
- **Session groups** — Organize sessions into color-coded groups with pinned configs and `.clave` files
- **Flexible layouts** — Single, split (2-panel), or grid (4-panel) view modes
- **Searchable sidebar** — Filter sessions by name, folder, or path
- **Task Queue** — Queue up prompts and launch them as new Claude sessions with one click
- **Git panel** — Status, diff viewer, commit history, stage/unstage, commit, push, pull, plus **MagicSync** (pull → stage → AI commit message → commit → push in one click) and **Git Journey** (visual commit history grouped by push batch)
- **File browser** — Local and remote file trees with syntax-highlighted preview, markdown rendering, and Cmd+P search palette
- **History** — Browse and search past Claude Code conversations, restart any session from history
- **Daily Log** — AI-generated daily summaries of your work, grouped by project, with a week heatmap strip and timeline view
- **Work Tracker** — Daily time tracking with streaks, weekly charts, and break reminders
- **Usage analytics** — Token usage, per-day cost tracking (day/week/month), GitHub-style year-long activity heatmap
- **SSH / Remote sessions** — Connect to remote hosts via SSH for terminal sessions and SFTP file browsing
- **Agent chat panel** — Integrated agent chat via WebSocket connection to OpenClaw
- **Session templates** — Launch pre-configured sessions with saved directories and modes
- **Internationalization** — English and Simplified Chinese UI
- **Keyboard shortcuts** — Cmd+P (file palette), Cmd+E (file tree), Cmd+T (new terminal), Cmd+N (new Claude session), Cmd+D (dangerous mode), Cmd+W (close tab)
- **Dark / Light / Coffee themes** — Full theming for both terminal and UI
- **URL detection** — Detects localhost URLs in terminal output and makes them clickable
- **Native macOS feel** — Hidden inset titlebar with traffic light controls, native notifications
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

[Electron](https://www.electronjs.org/) · [React 19](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/) · [xterm.js](https://xtermjs.org/) · [node-pty](https://github.com/microsoft/node-pty) · [Zustand](https://zustand.docs.pmnd.rs/) · [Tailwind CSS v4](https://tailwindcss.com/) · [Framer Motion](https://motion.dev/) · [shiki](https://shiki.style/) · [simple-git](https://github.com/steveukx/git-js) · [ssh2](https://github.com/mscdex/ssh2)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting bugs, suggesting features, and submitting pull requests.

## License

[MIT](LICENSE)
