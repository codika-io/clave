# Keyboard Shortcuts

These are Clave's defaults. Open **Settings → Keymaps** to see or change the active bindings. Changes take effect in every open window when you press Save.

## Command mode

`Cmd+K` enters command mode. The next key must arrive within 300ms. A matched command runs; an unmatched or late key is consumed and exits command mode.

| Shortcut | Action |
|---|---|
| Cmd+K C | New Claude Code session |

The master key is a **Cmd** chord on purpose: Clave reads the key before the terminal does, so a Ctrl chord as master would eat the key inside every session — Ctrl+B is tmux's own prefix and the shell's "move left". Unset the master key in Settings to disable command mode. Direct shortcuts keep working.

## Sessions

| Shortcut | Action |
|---|---|
| Cmd+N | New Claude Code session |
| Cmd+T | New terminal session |
| Cmd+D | New Claude session without permission prompts |
| Cmd+Shift+A | New Claude Agents session |
| Cmd+I | New Antigravity CLI session |
| Cmd+U | New Codex CLI session |
| Cmd+Shift+P | New Pi session |
| Cmd+Option plus a launch shortcut | Choose the new session's folder |
| Cmd+Backspace | Kill focused session |
| Cmd+W | Close focused file tab, or the window when no file tab is focused |
| Cmd+1–9 | Switch to session by index |
| Cmd+Shift+] | Next session |
| Cmd+Shift+[ | Previous session |

## Navigation

| Shortcut | Action |
|---|---|
| Cmd+B | Toggle left sidebar |
| Cmd+E | Toggle right sidebar |
| Cmd+P | File palette |
| Cmd+F | Focus sidebar search |
| Cmd+, | Open settings |
| Cmd+Shift+G | Open Git panel |
| Cmd+Shift+H | Open session history |
| Cmd+? | Open help panel |
| Cmd+Ctrl+] | Next workspace |
| Cmd+Ctrl+[ | Previous workspace |

## Sidebar and application

| Shortcut | Action |
|---|---|
| Cmd+G | Group selected sessions |
| Cmd+Option+G | Ungroup selected sessions |
| Cmd+Shift+Backspace | Reset all sessions after confirmation |
| Cmd+Z | Undo the last sidebar change |
| Cmd+Shift+N | New window |

Code editor, terminal editing, and standard macOS shortcuts are not managed by Clave's keymap editor.
