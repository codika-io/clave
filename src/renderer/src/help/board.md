# Task Queue

The task queue lets you line up prompts and run them as Claude Code sessions.

[Open the Task Queue](clave://navigate/board)

## How It Works

The queue is a simple list of tasks. Each task holds a prompt that can be sent to a new Claude session with one click.

## Creating Tasks

Click the **+** button to add a task. Each task can have:

- **Title**: What needs to be done
- **Prompt**: The exact prompt to send to Claude (required to run)
- **Folder**: Working directory for the session
- **Dangerous mode**: Optionally run with `--dangerously-skip-permissions`

## Running Tasks

Click the **Run** button on a task. This creates a new Claude Code session in the task's folder and sends the prompt automatically.

## Managing Tasks

Right-click a task to edit or delete it. Tasks are persisted locally so they survive app restarts.
