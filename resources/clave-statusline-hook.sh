#!/bin/sh
# Clave status-line hook.
# Invoked by Claude Code with the session's status JSON on stdin.
# Usage: clave-statusline-hook.sh <claudeSessionId> <outputDir> [<userCommand>]
#
# 1. Writes stdin (the status JSON) atomically to <outputDir>/<claudeSessionId>.json
#    so the Clave main process can render live session pills.
# 2. If <userCommand> is given (the user's own `statusLine.command` from
#    ~/.claude/settings.json), pipes the same JSON into it and prints its
#    output so claude's visible bottom-bar keeps the user's customisation.

set -u

sid="${1:-}"
dir="${2:-}"
user_cmd="${3:-}"

if [ -z "$sid" ] || [ -z "$dir" ]; then
  # Still try to forward to the user's command if configured, so we never
  # silently hide the bottom-bar.
  if [ -n "$user_cmd" ]; then
    cat | sh -c "$user_cmd" 2>/dev/null || true
  fi
  exit 0
fi

mkdir -p "$dir" 2>/dev/null || true
tmp="$dir/.$sid.json.tmp.$$"
out="$dir/$sid.json"

# Slurp stdin once — we need to both persist it and (optionally) feed it to
# the user's command.
payload=$(cat)

printf '%s' "$payload" > "$tmp" 2>/dev/null && mv -f "$tmp" "$out" 2>/dev/null || rm -f "$tmp" 2>/dev/null

if [ -n "$user_cmd" ]; then
  # Forward the same JSON payload to the user's status-line command and
  # print whatever it emits. Failures are silent so a broken user command
  # never wedges claude.
  printf '%s' "$payload" | sh -c "$user_cmd" 2>/dev/null || true
fi
