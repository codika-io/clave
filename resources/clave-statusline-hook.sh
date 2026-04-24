#!/bin/sh
# Clave status-line hook.
# Invoked by Claude Code with the session's status JSON on stdin.
# Usage: clave-statusline-hook.sh <claudeSessionId> <outputDir>
#
# Writes stdin (the status JSON) atomically to <outputDir>/<claudeSessionId>.json
# so the Clave main process can render live session pills.
# Emits an empty status line on stdout (Clave does not need CC's bottom-bar).

set -eu

sid="${1:-}"
dir="${2:-}"

if [ -z "$sid" ] || [ -z "$dir" ]; then
  exit 0
fi

mkdir -p "$dir" 2>/dev/null || exit 0
tmp="$dir/.$sid.json.tmp.$$"
out="$dir/$sid.json"

cat > "$tmp"
mv -f "$tmp" "$out" 2>/dev/null || rm -f "$tmp"

printf ''
