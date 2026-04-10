# Kanban Board

The board lets you queue up tasks and run them through Claude Code sessions.

[Open the Board](clave://navigate/board)

## Columns

The board has four default columns:

- **Backlog** — Tasks waiting to be worked on (new tasks land here)
- **Ready** — Tasks you've prioritized for soon
- **Running** — Tasks currently being worked on by a Claude session
- **Done** — Completed tasks

Drag cards between columns to organize your work. You can also add custom columns.

## Creating Tasks

Click the **+** button on any column to add a task. Each task can have:

- **Title** — What needs to be done
- **Prompt** — The exact prompt to send to Claude (required to run)
- **Notes** — Context or details for reference
- **Folder** — Working directory for the session
- **Tags** — Color-coded labels for categorization

## Running Tasks

Click the **Run** button on a card (or in the detail panel). This:

1. Creates a new Claude Code session
2. Moves the card to the **Running** column
3. Sends the prompt to Claude automatically

The card shows live session status (active/idle/permission needed).

## Tags

Add tags to categorize tasks. Tags have colors and can be filtered in the board toolbar. Click a tag in the filter bar to show only matching cards.

## History Integration

Cards in the Done column show a summary of what Claude accomplished. Click **Browse History** to see the full conversation.
