# Clave Plugin (`workspace-builder`)

Companion agent plugin for [Clave](https://github.com/codika-io/clave) — a multi-session Claude Code desktop app. Installs one skill, `create-workspace`, that lets your coding agent generate and configure `.clave` workspace files (groups, sessions, terminals, icons, toolbar actions) from a natural-language description.

Conforms to the [Open Plugin Specification v1.0](https://github.com/vercel-labs/open-plugin-spec).

## Install

### Any Open-Plugin-compatible host (Claude Code, Cursor, …)

```bash
npx plugins add codika-io/clave-plugin
```

The `plugins` CLI auto-detects which agent tools are installed and installs into all of them.

### Claude Code (native)

```
/plugin marketplace add codika-io/clave-plugin
/plugin install workspace-builder@clave-plugin
```

## What's Inside

| Skill | What it does |
|---|---|
| `workspace-builder:create-workspace` | Scaffold a `.clave` workspace file from a description. Handles groups, session configs, terminal commands, icons, and toolbar actions. |

## Usage

Once installed, ask your agent things like:

- *"Create a clave workspace for my codika-app-platform project — 3 sessions: frontend, functions, docs."*
- *"Scaffold a workspace for the slideless repo with separate terminal tabs for the app, CLI, and docs."*
- *"Add a toolbar action to my existing workspace that runs `npm test`."*

The agent invokes `workspace-builder:create-workspace`, writes a valid `.clave` file to your chosen path, and you open it in Clave.

## About Clave

Clave is a macOS desktop app for running many Claude Code sessions in parallel with shared layouts, git panels, and daily logs. Download at [github.com/codika-io/clave](https://github.com/codika-io/clave).

## License

MIT — see `LICENSE`.
