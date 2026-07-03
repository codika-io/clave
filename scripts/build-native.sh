#!/usr/bin/env bash
# Builds the universal mission-control helper into resources/native/.
# Idempotent: skips when the binary is newer than the Swift source.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "native: not macOS, skipping helper build"
  exit 0
fi

SRC="$ROOT/native/mission-control/main.swift"
OUT="$ROOT/resources/native/mission-control-helper"

if [[ -f "$OUT" && "$OUT" -nt "$SRC" ]]; then
  echo "native: mission-control-helper up to date"
  exit 0
fi

mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "native: compiling mission-control-helper (arm64 + x86_64)"
swiftc -O -target arm64-apple-macos11.0 -o "$TMP/arm64" "$SRC"
swiftc -O -target x86_64-apple-macos11.0 -o "$TMP/x86_64" "$SRC"
lipo -create "$TMP/arm64" "$TMP/x86_64" -output "$OUT"
chmod +x "$OUT"
lipo -info "$OUT"
