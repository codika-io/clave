# Clave Plugin

Single-plugin [Open Plugin v1](https://github.com/vercel-labs/open-plugin-spec) repo. Companion to the [Clave desktop app](https://github.com/codika-io/clave). Plugin name is `clave`; all skills surface as `/clave:<skill>` in any installed host. Ships `clave:create-workspace` — generates `.clave` workspace files via an AI agent.

## Repository Structure

The repo root IS the plugin root. No `plugins/` wrapper.

```
.
├── .plugin/plugin.json              # Vendor-neutral manifest (Open Plugin v1)
├── .claude-plugin/plugin.json       # Claude Code preferred manifest (kept in sync)
├── skills/
│   └── create-workspace/
│       └── SKILL.md                 # The skill itself — agent discovers it at runtime
├── README.md
├── CLAUDE.md
├── LICENSE
└── .gitignore
```

## Relationship to the Clave Electron app

The Clave desktop app lives at [`codika-io/clave`](https://github.com/codika-io/clave). The running app does **not** read this repo — it reads installed plugins from Claude Code's global `~/.claude/plugins/` cache. This plugin is therefore:

- Distribution-only: users install it with `npx plugins add codika-io/clave-plugin`
- Independently versioned from the app
- Safe to iterate on without touching the Electron codebase

Before the `2026-04` migration this plugin lived inside the `codika-io/clave` repo under `plugins/workspace-builder/`. It was extracted into its own repo to match the single-plugin Open Plugin v1 convention used by `codika-io/plugin` and `slideless-ai/plugin`.

## Manifests

Two manifests kept intentionally in sync:

- `.plugin/plugin.json` — canonical Open Plugin v1 manifest. Read by `npx plugins`, Cursor, and any Open-Plugin-compatible host.
- `.claude-plugin/plugin.json` — Claude Code vendor-prefixed manifest. Per Open Plugin §5.1, Claude Code prefers this when both are present.

When editing manifest metadata (`version`, `description`, `keywords`, …), update **both** files.

## Adding a new skill

1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`).
2. The plugin loader picks it up automatically from the default `skills/` discovery location (Open Plugin §7.1) — no manifest edits needed.
3. Document it in `README.md`.

## Versioning

Follow [semver](https://semver.org/):
- **Major** — breaking: rename/remove a skill, change plugin `name`.
- **Minor** — additive: new skill, new references.
- **Patch** — doc/fix-only.

Update both manifests in lockstep.

## Local testing

From the repo root:

```bash
npx plugins add .
```

Skills surface as `/clave:<skill>` in any installed host.

## Conventions

- Skills must NOT contain secrets, API keys, or internal URLs.
- Keep each `SKILL.md` self-contained — works standalone.
- If the `.clave` file format changes in the Electron app, update `skills/create-workspace/SKILL.md` in the same release cycle.
