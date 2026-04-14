# Context Inventory

A per-session popover that shows everything Claude Code loads into context when the session starts — CLAUDE.md chain, skills, plugins, commands, agents, MCP servers, hooks, and memory — with estimated token cost.

Open it by clicking the small database icon in the terminal header of any Claude session.

## What It Shows

- **Header totals**: total estimated tokens and percentage of the context window (e.g. `37,241 / 200,000 tok · 18%`)
- **CLAUDE.md**: the full resolution chain — user global, project root, and any parent-directory CLAUDE.md files that apply to the current working directory
- **MCP Servers**: servers configured in `.mcp.json` (project/parent dirs), user settings, and plugins
- **Memory**: project memory files under `~/.claude/projects/<sanitized-cwd>/memory/`
- **Hooks**: entries from `hooks.json` at project, user, and plugin scopes
- **Plugins**: installed plugin manifests (`.claude-plugin/plugin.json`)
- **Skills**: skill frontmatter loaded at session start — only the `name` and `description` count toward context; skill bodies load on invocation
- **Commands**: slash commands from plugins and `~/.claude/commands/`
- **Agents**: subagents from plugins and `~/.claude/agents/`

Each section shows entry count and total tokens. Click a section header to expand or collapse. CLAUDE.md and MCP are open by default since they're the most load-bearing for behavior.

## Token Counts

Counts are estimates using the common approximation *chars ÷ 4*. They're good for relative comparisons ("skills are my largest category") and rough context-budget awareness. For exact numbers, use Claude Code's own telemetry.

**Not counted:**

- **MCP runtime tool schemas**. MCP servers expose tools at connection time; their JSON Schema contributes to context but isn't measurable without running the server. Only the config file size is counted.
- **Memory that Claude actively retrieves mid-conversation**. The inventory reflects *start-of-session* load, not mid-session growth.

## Refresh and Cache

The popover pulls from a 30-second cache keyed by working directory. Click the **↻** button to force a re-scan and invalidate the cache. File contents are cached per-mtime, so repeated scans of unchanged files are nearly free.

## Info Button

The **ⓘ** button in the header shows quick tips for reducing context:

- `/plugin` — disable or uninstall plugins in Claude Code
- `/clear` — wipe the current conversation
- `/compact` — summarize to shrink context mid-session
- Edit `~/.claude/settings.json` to turn individual skills or MCP servers off

These are Claude Code commands; Clave doesn't run them for you. The inspector is read-only by design.

## Why Read-Only?

Clave is a session manager — it observes what Claude Code loads but doesn't manipulate Claude's runtime. Toggling plugins, editing settings, and clearing context are handled by Claude Code itself via slash commands or config files. The inspector makes those decisions better-informed without getting in the way.
