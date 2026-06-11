<div align="center">

<img width="80" height="80" alt="Clave" src="resources/icon.png" />

[![License](https://img.shields.io/github/license/codika-io/clave?labelColor=333333&color=666666)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/codika-io/clave/total?labelColor=333333&color=666666)](https://github.com/codika-io/clave/releases)
[![GitHub Stars](https://img.shields.io/github/stars/codika-io/clave?labelColor=333333&color=666666)](https://github.com/codika-io/clave)

**Clave is a macOS desktop app for managing multiple coding-agent sessions in parallel.**

Provider-agnostic: run Claude Code, Gemini CLI, and Codex CLI sessions side by side. Open as many as you need, arrange them in split or grid layouts, and switch between them instantly.

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

### Uninstall

Quit Clave and drag it from `/Applications` to the Trash. To also remove local settings and cached session data, delete `~/Library/Application Support/clave`.

## Agent plugin

Clave ships a companion agent plugin ([`codika-io/clave-plugin`](https://github.com/codika-io/clave-plugin)) that lets any Claude Code, Cursor, or other [Open-Plugin-compatible](https://github.com/vercel-labs/open-plugin-spec) coding agent generate `.clave` workspace files for you.

**Install (any Open-Plugin-compatible host — auto-detects Claude Code, Cursor, …):**

```bash
npx plugins add codika-io/clave-plugin
```

**Claude Code native alternative:**

```
/plugin marketplace add codika-io/clave-plugin
/plugin install clave@clave-plugin
```

Both paths produce the same `/clave:create-workspace` skill.

**Usage:** ask your agent something like *"create a clave workspace for this repo with 3 sessions"*. It writes a valid `.clave` file to your chosen path; open it in Clave.

**Updating:**

```bash
npx plugins add codika-io/clave-plugin   # re-run to pull latest
```

(Or `/plugin update clave@clave-plugin` in Claude Code native.)

**Uninstalling:** `/plugin uninstall clave@clave-plugin` in Claude Code, or the equivalent in your host.

## Features

- **Run a fleet of agents** — Open unlimited CLI coding-agent sessions, each in its own PTY. Provider-agnostic: Claude Code, Gemini CLI, and Codex CLI side by side, plus plain terminals. Arrange them single, split, or in a grid, group them by project, and queue prompts to launch with one click.
- **Git, built in** — A full git panel with diff viewer and commit history, plus MagicSync: pull, stage, write an AI commit message, commit, and push in one click.
- **Local & remote files** — Browse and edit files with syntax-highlighted previews, on your machine or on remote hosts over SSH/SFTP.
- **Remote sessions** — Connect to any host over SSH and run your agents there with the same UI and shortcuts.
- **Fully local** — A desktop app with no cloud backend and no account; your code, sessions, and keys stay on your machine.

## Requirements

- macOS (Apple Silicon or Intel)
- At least one supported agent CLI installed and authenticated — [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Gemini CLI](https://github.com/google-gemini/gemini-cli), and/or [Codex CLI](https://github.com/openai/codex). Clave detects whichever you have.

## Privacy & network

Clave is local-first. It has no account or sign-in, and sends **no telemetry, analytics, or tracking** of any kind. Your sessions, history, and settings stay on your machine.

The only network requests Clave makes are:

- **Claude Code** reaches the Anthropic API through your own local Claude Code install — Clave never proxies or sees that traffic.
- **Auto-updates** — [electron-updater](https://www.electron.build/auto-update) checks [GitHub Releases](https://github.com/codika-io/clave/releases) for new versions and installs the signed, notarized build on quit. Auto-download is off by default.
- **Git operations** — standard fetch/pull/push to whatever remotes your own repositories use.
- **SSH / SFTP** — only to remote hosts you explicitly add.
- **OpenClaw agent chat** — an optional WebSocket connection, established only when you connect an SSH location that has OpenClaw running.

> A "Dangerous Mode" session (Cmd+D) launches Claude Code with `--dangerously-skip-permissions`. It is never the default and is clearly labelled in the UI.

### How we measure adoption

Since Clave sends nothing home, the only adoption numbers we look at are the aggregate statistics GitHub computes on its side: release download counts, repository stars, and repository traffic. A scheduled job snapshots those public-API numbers once a day. They contain no user identifiers, no IPs, and no device information — GitHub never exposes any of that to us, and nothing is ever collected from your machine. You can verify in this codebase that no analytics code exists.

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
