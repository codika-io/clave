# Settings

Configure your Clave experience. Open with **Cmd+,** or from the sidebar.

[Open Settings](clave://navigate/settings)

## Profile

Set your display name, choose an avatar icon, and pick an avatar color. Your profile appears in session headers.

## Appearance

Choose between three themes:

- **Dark**: Default dark theme
- **Light**: Light theme
- **Coffee**: Warm-toned dark theme

## Agents

Create named launch profiles for Claude, Antigravity, Codex, and Pi. Commands and additional arguments are token arrays, so wrappers work without shell parsing. Set a global default and an optional default for each workspace. Pi profiles can also select a provider, model, and thinking level.

For `tokenops run -- env -u ANTHROPIC_API_KEY claude`, enter each word as one Command token, in that order. Clave appends its session, model, integration, and prompt arguments after the profile tokens.

Launch profile arguments are stored locally without encryption. Do not put secrets in them.

## Workspaces

Manage multiple workspaces. Each workspace has its own sessions, groups, and settings.

## Locations

Configure remote SSH locations for running sessions on other machines. See the **Remote Sessions** doc for details.
