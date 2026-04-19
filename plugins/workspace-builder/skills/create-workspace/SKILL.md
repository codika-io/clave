---
name: create-workspace
description: Creates a .clave workspace file that defines groups, sessions, terminals, toolbar actions, and icons for the Clave desktop app. Use when the user wants to create, edit, or understand .clave workspace files.
---

# Create Workspace

This skill helps you create and configure `.clave` workspace files for the Clave desktop app — a multi-session terminal manager built on Electron.

## What is a `.clave` file?

A `.clave` file is a JSON file that defines one or more **groups**. Each group contains **sessions** (terminal instances) and **terminals** (quick-action buttons with pre-configured commands). When dropped into Clave or loaded via the Workspaces settings, these groups appear as pinned items that the user can launch with a click.

### Single-group vs multi-group

A `.clave` file can define either a single group or multiple groups:

**Single-group** (e.g. `my-project.clave`):
```json
{
  "$schema": "clave/1.0",
  "name": "My Project",
  "cwd": ".",
  "color": "blue",
  "sessions": [...],
  "terminals": [...]
}
```

**Multi-group / workspace** (e.g. `workspace.clave`):
```json
{
  "$schema": "clave/1.0",
  "groups": [
    { "name": "Group A", "cwd": ".", ... },
    { "name": "Group B", "cwd": "../other", ... }
  ]
}
```

The format is auto-detected: if the top level has a `groups` array, it's multi-group. Otherwise, it's single-group.

## Path resolution

All `cwd` paths in a `.clave` file are **relative to the directory containing the file**. This makes workspace files portable — they work on any machine where the project structure matches.

| Relative path | Meaning |
|---|---|
| `.` | Same directory as the .clave file |
| `src/backend` | Subdirectory |
| `../other-repo` | Sibling directory |

## Group definition

Each group has these fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name shown in the sidebar pin |
| `cwd` | string | Yes | Working directory for the group (relative path) |
| `color` | string | No | Group accent color (see Colors below) |
| `category` | string | No | Category label for organizing pins in the sidebar (e.g. `"Platform"`, `"Satellites"`) |
| `toolbar` | boolean | No | If `true`, this group's terminals appear as quick-action buttons in the top toolbar instead of the sidebar |
| `sessions` | array | Yes | Terminal sessions to spawn (see Sessions below) |
| `terminals` | array | Yes | Command buttons shown on the group (see Terminals below) |

## Sessions

Each session spawns a terminal process in a specific directory. Sessions can run in Claude Code mode (AI assistant) or plain terminal mode.

```json
{
  "cwd": ".",
  "name": "Backend",
  "claudeMode": true,
  "dangerousMode": false
}
```

| Field | Type | Description |
|---|---|---|
| `cwd` | string | Working directory (relative to .clave file) |
| `name` | string | Display name in the sidebar |
| `claudeMode` | boolean | `true` = starts Claude Code AI assistant, `false` = plain terminal |
| `dangerousMode` | boolean | `true` = Claude runs with `--dangerously-skip-permissions` |

**Tips:**
- For development groups, create two sessions: one `claudeMode: true` for AI work, one `claudeMode: false` for running dev servers
- Session names should be short and descriptive
- An empty `sessions` array is valid (useful for toolbar-only groups)

## Terminals

Terminals are command buttons that appear as colored icons on the group. Clicking a terminal icon spawns a new session that runs or pre-fills the command.

```json
{
  "command": "npm run dev",
  "commandMode": "auto",
  "color": "green",
  "icon": "bolt"
}
```

| Field | Type | Description |
|---|---|---|
| `command` | string | Shell command to execute. Can be empty for a blank shell |
| `commandMode` | `"prefill"` or `"auto"` | `"prefill"` = types the command but waits for Enter. `"auto"` = executes immediately |
| `color` | string | Button color (see Colors below) |
| `icon` | string | Button icon (see Icons below) |
| `cwd` | string | Optional. Working directory for this terminal (relative path). If omitted, uses the group's `cwd` |

**Tips:**
- Use `"auto"` for dev servers (`npm run dev`) that should start immediately
- Use `"prefill"` for dangerous or one-time commands (`firebase deploy`, `npm publish`) so the user can review before executing
- By default, terminals run in the group's `cwd`. Use per-terminal `cwd` when a group contains apps in different directories (e.g. a monorepo with `client/` and `dashboard/` sub-apps)

## Toolbar groups

When a group has `"toolbar": true`, its terminals appear as quick-action buttons in the top toolbar bar of the Clave window instead of the sidebar. This is ideal for utility commands that should always be accessible regardless of which group is active.

**Rules:**
- Toolbar groups do NOT appear in the sidebar pinned area
- Toolbar groups typically have an empty `sessions` array (they're just button collections)
- If multiple groups have `toolbar: true`, they're separated by subtle vertical dividers
- Toolbar buttons show the terminal's icon in its color, with a tooltip showing the command on hover

**Example — Auth toolbar group:**
```json
{
  "name": "Auth",
  "cwd": ".",
  "color": "yellow",
  "toolbar": true,
  "sessions": [],
  "terminals": [
    { "command": "firebase login --reauth", "commandMode": "prefill", "color": "yellow", "icon": "fire" },
    { "command": "gcloud auth login", "commandMode": "prefill", "color": "blue", "icon": "shield" }
  ]
}
```

## Colors

Available named colors for groups and terminals:

| Color | Hex | Best for |
|---|---|---|
| `black` | `#3A3A3C` | Neutral / infrastructure |
| `green` | `#34C759` | Dev servers, success actions |
| `teal` | `#5AC8FA` | Backend / API |
| `blue` | `#007AFF` | Primary projects |
| `purple` | `#AF52DE` | AI / agents / creative |
| `yellow` | `#FFD60A` | Auth / warnings / utilities |
| `pink` | `#FF6482` | Secondary products |
| `red` | `#FF3B30` | Deploy / danger / critical |

Custom hex colors (e.g. `"#FF9500"`) are also supported.

## Icons

Available icons for terminal buttons (18 options):

| Icon | Heroicon | Best for |
|---|---|---|
| `terminal` | CommandLineIcon | Default / generic shell |
| `fire` | FireIcon | Firebase, hot reload |
| `bolt` | BoltIcon | Dev servers, fast actions |
| `rocket` | RocketLaunchIcon | Deploy, publish, launch |
| `eye` | EyeIcon | Watch, inspect, status |
| `globe` | GlobeAltIcon | Auth, cloud, web |
| `cube` | CubeIcon | Build, package, container |
| `heart` | HeartIcon | Health checks, favorites |
| `star` | StarIcon | Important, featured |
| `user` | UserIcon | Auth, login, identity |
| `shield` | ShieldCheckIcon | Security, credentials |
| `wrench` | WrenchIcon | Fix, repair, config |
| `beaker` | BeakerIcon | Test, experiment |
| `cpu` | CpuChipIcon | Processing, compute |
| `signal` | SignalIcon | Network, sync, status |
| `bug` | BugAntIcon | Debug, troubleshoot |
| `sparkles` | SparklesIcon | AI, generate, magic |
| `cloud` | CloudIcon | Cloud services, hosting |

If no icon is specified, `terminal` (CommandLineIcon) is used as the default.

## Complete workspace example

```json
{
  "$schema": "clave/1.0",
  "groups": [
    {
      "name": "Auth",
      "cwd": ".",
      "color": "yellow",
      "toolbar": true,
      "sessions": [],
      "terminals": [
        { "command": "firebase login --reauth", "commandMode": "prefill", "color": "yellow", "icon": "fire" },
        { "command": "gcloud auth login", "commandMode": "prefill", "color": "blue", "icon": "shield" }
      ]
    },
    {
      "name": "Frontend",
      "cwd": "apps/web",
      "category": "Apps",
      "color": "blue",
      "sessions": [
        { "cwd": "apps/web", "name": "Web", "claudeMode": true, "dangerousMode": false },
        { "cwd": "apps/web", "name": "Web Dev", "claudeMode": false, "dangerousMode": false }
      ],
      "terminals": [
        { "command": "npm run dev", "commandMode": "auto", "color": "green", "icon": "bolt" },
        { "command": "npm run build", "commandMode": "prefill", "color": "purple", "icon": "cube" }
      ]
    },
    {
      "name": "API",
      "cwd": "apps/api",
      "category": "Apps",
      "color": "teal",
      "sessions": [
        { "cwd": "apps/api", "name": "API", "claudeMode": true, "dangerousMode": false }
      ],
      "terminals": [
        { "command": "npm run dev", "commandMode": "auto", "color": "green", "icon": "bolt" },
        { "command": "npm run deploy", "commandMode": "prefill", "color": "red", "icon": "rocket" }
      ]
    }
  ]
}
```

## Per-terminal working directory

When a single group contains apps in different subdirectories (e.g. a monorepo), use per-terminal `cwd` to run each terminal in the right location without splitting into separate groups:

```json
{
  "name": "Creafid",
  "cwd": "satellites/creafid",
  "color": "#10b981",
  "sessions": [
    { "cwd": "satellites/creafid", "name": "Creafid", "claudeMode": true, "dangerousMode": true }
  ],
  "terminals": [
    { "command": "npm run dev", "commandMode": "auto", "cwd": "satellites/creafid/creafid-app", "color": "#10b981", "icon": "device-phone-mobile" },
    { "command": "npm run dev", "commandMode": "auto", "cwd": "satellites/creafid/creafid-dashboard", "color": "#3b82f6", "icon": "computer-desktop" }
  ]
}
```

The `cwd` priority when spawning a terminal is: **terminal `cwd`** → **group `cwd`** → **first session's `cwd`**.

## File placement

`.clave` files can be placed in three locations (checked in this order per directory):

| Location | Use case |
|---|---|
| `workspace.clave` | Simple single-file setup in project root |
| `.clave/workspace.clave` | Cleaner — keeps the root tidy |
| `.clave/workspaces/default.clave` | **Recommended for repos.** Supports per-user overrides |

For repos in a multi-repo workspace, always use `.clave/workspaces/default.clave`. This is the standard convention and enables the auto-discovery and per-user override features below.

## Auto-discovery

A workspace `.clave` file can automatically discover and load `.clave` files from repos nested under its root directory. Add `"autoDiscover": true` at the top level:

```json
{
  "$schema": "clave/1.0",
  "autoDiscover": true,
  "groups": [
    { "name": "Auth", "toolbar": true, "..." : "..." }
  ]
}
```

When the workspace is activated, Clave recursively scans the root directory for `.clave` files in repos and merges them as additional pinned groups alongside the workspace's own groups.

**How it works:**
- Scans up to 4 levels deep (configurable)
- Skips `node_modules`, `.git`, `references`, `build`, `dist`, `.next`, `.turbo`
- Each discovered file is independently tracked and watched for changes
- Groups from the workspace file load first, discovered groups load after (sorted alphabetically)
- On workspace deactivation, all discovered pins are cleaned up

**Advanced configuration:**
```json
{
  "autoDiscover": {
    "enabled": true,
    "patterns": ["workspace.clave", ".clave/workspace.clave"],
    "exclude": ["node_modules", ".git", "references"],
    "maxDepth": 4
  }
}
```

**Example setup — multi-repo workspace:**

Root workspace (`.clave/workspaces/default.clave`):
```json
{
  "$schema": "clave/1.0",
  "autoDiscover": true,
  "groups": [
    { "name": "Auth", "cwd": ".", "toolbar": true, "sessions": [], "terminals": [...] },
    { "name": "Platform", "cwd": "platform/app", "category": "Platform", "..." : "..." }
  ]
}
```

Repo-level file (`satellites/my-product/.clave/workspaces/default.clave`):
```json
{
  "$schema": "clave/1.0",
  "name": "My Product",
  "cwd": ".",
  "category": "Satellites",
  "color": "blue",
  "sessions": [{ "cwd": ".", "name": "My Product", "claudeMode": true, "dangerousMode": true }],
  "terminals": [{ "command": "npm run dev", "commandMode": "auto", "color": "green", "icon": "bolt" }]
}
```

The repo's group is auto-discovered and appears in the sidebar under "Satellites" — no need to add it to the root workspace file.

## Per-user workspace overrides

When a workspace file is named after a person (e.g. `romain.clave`), the auto-discovery scanner uses that name as a **workspace ID** to look for per-user overrides in repos.

**Resolution order in each repo's `.clave/workspaces/` folder:**
1. `{workspaceId}.clave` (e.g. `romain.clave`) — personal override
2. `default.clave` — shared team default
3. First `.clave` file found — fallback

**Example:** If the root workspace is `romain.clave`, and a repo has:
```
.clave/workspaces/
  default.clave      ← shared config (used by everyone)
  romain.clave       ← Romain's override (different sessions, colors, etc.)
```

Romain's Clave app picks `romain.clave`. Another team member using `default.clave` as their workspace gets the shared config.

This allows personal customization (extra debug sessions, different colors, additional terminals) without affecting the team's default configuration.

## How to use

1. **Create the file** — Save as `.clave/workspaces/default.clave` in your project (or `workspace.clave` in the root)
2. **Import into Clave** — Either:
   - Drag-drop the file from Finder onto the Clave pin area
   - Or go to Settings → Workspaces → Add Workspace (select the folder containing the `.clave` file)
   - Or rely on **auto-discovery** if the parent workspace has `"autoDiscover": true`
3. **Activate** — Click the workspace in Settings to load all groups as pins
4. **Launch** — Click any pin to spawn its sessions and terminals

## Best practices

- **Use `.clave/workspaces/default.clave` for repos** — Standard convention, supports auto-discovery and per-user overrides
- **Use `autoDiscover: true` for multi-repo workspaces** — New repos automatically appear when they add a `.clave` file
- **Keep workspace-level groups minimal** — Only toolbar actions and cross-repo groups belong in the root workspace
- **Use categories** — Group related pins under labels like `"Platform"`, `"Satellites"`, `"Tools"`
- **Use toolbar for utilities** — Auth commands, CLI tools, and status checks work great as toolbar buttons
- **Separate Claude and dev sessions** — Create one `claudeMode: true` session for AI work and one `claudeMode: false` for dev servers
- **Use `prefill` for dangerous commands** — Deploy, publish, and destructive commands should require manual confirmation
- **Use `auto` for dev servers** — `npm run dev` and watch commands should start immediately
- **Keep group names short** — They appear as small pin buttons in the sidebar
