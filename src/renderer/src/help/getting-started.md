# Getting Started

Clave is a desktop app for managing multiple Claude Code terminal sessions side by side. Instead of juggling tabs or tmux panes, you get a visual workspace with integrated tools.

## Your First Session

1. Press **Cmd+N** to create a new Claude Code session
2. Claude starts in the terminal — type a prompt and go
3. The session appears in the left sidebar with a status indicator

## Session Types

- **Claude Code** (Cmd+N) — A full Claude Code session with AI assistance
- **Terminal** (Cmd+T) — A plain shell, no Claude
- **Dangerous Mode** (Cmd+D) — Claude Code with `--dangerously-skip-permissions` (skips approval prompts)

## What Else Can Clave Do?

- **[Kanban Board](clave://navigate/board)** — Queue up tasks and let Claude work through them
- **[Git Panel](clave://navigate/side:git)** — Stage, commit, push, and visualize your git history
- **[File Browser](clave://navigate/side:files)** — Browse and preview files in your project
- **[History](clave://navigate/history)** — Browse past Claude Code sessions
- **[Usage Analytics](clave://navigate/usage)** — Track token usage and costs

## Navigation

- **Left sidebar** — Your sessions, groups, board, and history
- **Right sidebar** (Cmd+E) — File browser and git panel
- **Cmd+P** — Quick file search
- **Cmd+B** — Toggle left sidebar
- **Cmd+,** — Settings (theme, profile, templates)