# Sessions

Sessions are the core of Clave. Each session is an independent terminal running in its own tab.

## Creating Sessions

| Shortcut | Type | Description |
|---|---|---|
| Cmd+N | Claude Code | AI-assisted coding session |
| Cmd+T | Terminal | Plain shell session |
| Cmd+D | Dangerous | Claude Code without permission prompts |

You can also create sessions from the **+** button in the sidebar.

## Session Status

Each session shows a colored dot in the sidebar:

- **Green (active)** — Claude is generating a response
- **Blue (idle)** — Waiting for your input
- **Amber (permission)** — Claude is asking for permission to run a tool
- **Gray (ended)** — Session has finished

## Session Groups

Drag sessions together in the sidebar to create groups. Groups let you:

- Organize related sessions (e.g., "Frontend + API + Tests")
- Collapse/expand to reduce clutter
- Color-code for visual distinction

See the **Session Groups** doc for more on pinned groups and .clave files.

## Closing Sessions

- **Cmd+Backspace** — Kill the focused session
- Right-click a session in the sidebar → Close

## Auto-Naming

Sessions are automatically named based on your first message to Claude. The name updates as the conversation progresses.
