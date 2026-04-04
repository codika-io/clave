# Usage Analytics

Track token usage, costs, and activity patterns across all your Claude Code sessions.

[Open Usage](clave://navigate/usage)

## What It Shows

- **Daily message and session counts** — How much you're using Claude
- **Token breakdown by model** — Input, output, cache read, and cache creation tokens
- **Cost estimates** — Based on current model pricing (Opus, Sonnet, Haiku)
- **Hourly activity** — When you're most active during the day

## Data Source

Usage data is read from Claude Code's session files (`~/.claude/projects/**/*.jsonl`). No data is sent anywhere — all analysis happens locally.