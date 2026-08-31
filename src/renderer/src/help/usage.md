# Usage Analytics

View Claude account limits and local Pi token and cost totals.

[Open Usage](clave://navigate/usage)

## What It Shows

- **Daily message and session counts**: How much you're using Claude
- **Token breakdown by model**: Input, output, cache read, and cache creation tokens
- **Cost estimates**: Based on current model pricing (Opus, Sonnet, Haiku)
- **Hourly activity**: When you're most active during the day

## Data Source

Pi totals come from `~/.pi/agent/sessions/**/*.jsonl` and cover Today, 7 days, 30 days, or all retained sessions. They are local totals, not provider quota. No Pi session data leaves the machine.
