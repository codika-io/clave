#!/usr/bin/env bash
# Builds the universal native helpers (native/<name>/main.swift) into
# resources/native/<name>-helper. Idempotent: a helper is skipped when its
# binary is newer than its Swift source.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "native: not macOS, skipping helper build"
  exit 0
fi

build_helper() {
  local name="$1"
  local src="$ROOT/native/$name/main.swift"
  local out="$ROOT/resources/native/$name-helper"

  if [[ -f "$out" && "$out" -nt "$src" ]]; then
    echo "native: $name-helper up to date"
    return 0
  fi

  mkdir -p "$(dirname "$out")"
  local tmp
  tmp="$(mktemp -d)"
  echo "native: compiling $name-helper (arm64 + x86_64)"
  swiftc -O -target arm64-apple-macos11.0 -o "$tmp/arm64" "$src"
  swiftc -O -target x86_64-apple-macos11.0 -o "$tmp/x86_64" "$src"
  lipo -create "$tmp/arm64" "$tmp/x86_64" -output "$out"
  chmod +x "$out"
  lipo -info "$out"
  rm -rf "$tmp"
}

build_helper mission-control
build_helper haptic
