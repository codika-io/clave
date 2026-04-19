# Clave Plugins

Claude Code plugin marketplace bundled with the Clave desktop app. The marketplace registry lives at the repo root (`.claude-plugin/marketplace.json`) so users can add it via `/plugin marketplace add codika-io/clave`.

## Structure

```
products/clave/
├── .claude-plugin/marketplace.json   # Marketplace registry (repo root)
└── plugins/
    └── workspace-builder/            # Plugin: workspace file builder
        ├── .claude-plugin/plugin.json
        └── skills/
            └── create-workspace/     # Skill: create .clave files
                └── SKILL.md
```

## Adding plugins

Each plugin lives in `plugins/<name>/` with a `.claude-plugin/plugin.json` and one or more skills in `skills/<skill-name>/SKILL.md`.

Register new plugins in `.claude-plugin/marketplace.json` at the clave repo root.
