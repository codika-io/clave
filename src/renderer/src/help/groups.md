# Session Groups

Groups let you organize sessions and save workspace configurations for quick launch.

## Creating Groups

Drag one session onto another in the sidebar to create a group. You can:

- **Rename**: Right-click the group header
- **Color**: Assign a color (8 presets or custom hex)
- **Collapse/Expand**: Click the group header

## Group Terminals

Each group can have terminal configs: pre-configured commands that spawn new sessions inside the group. Terminals support:

- **Command**: The shell command to run
- **Command mode**: `prefill` (paste into terminal for you to run) or `auto` (execute immediately)
- **Icon**: Choose from 18 icons (terminal, fire, bolt, rocket, globe, cube, etc.)
- **Color**: Match or override the group color
- **Working directory**: Override the group's default folder
- **Auto-launch localhost**: Automatically open detected localhost URLs

## Pinned Groups (.clave Files)

Pin a group to make it persistent. Pinned groups are saved as `.clave` JSON files and remember their full configuration across restarts. You can also:

- **Import**: Drop a `.clave` file into the pin area to load it
- **Export**: Right-click a group to export it as a shareable `.clave` file
- **Multi-group files**: A single `.clave` file can define multiple groups
- **Watch for changes**: Clave watches `.clave` files and reloads when they change on disk

Share `.clave` files with your team to standardize workspace setups.

## Toolbar Quick Actions

Mark a terminal inside a pinned group as a **toolbar** item. It appears as an icon button in the main toolbar for one-click session spawning.

## Launch Templates

Templates save your entire workspace layout (sessions, groups, working directories) for one-click restore. Manage them in [Settings](clave://navigate/settings). Set a default template that loads on startup, or keep the "Blank" template for a fresh start.
