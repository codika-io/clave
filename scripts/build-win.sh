#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[build-win]${NC} $*"; }
warn()  { echo -e "${YELLOW}[build-win]${NC} $*"; }
error() { echo -e "${RED}[build-win]${NC} $*" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ── Pre-flight checks ─────────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "node not found"
command -v npm  >/dev/null 2>&1 || error "npm not found"

# ── Build ──────────────────────────────────────────────────────────
VERSION="$(node -p "require('./package.json').version")"
info "Building Clave ${VERSION} for Windows (x64)..."

npm run build

info "Packaging Windows installer..."
npx electron-builder --win --x64

EXE_PATH="dist/clave-${VERSION}-setup.exe"
if [[ -f "$EXE_PATH" ]]; then
  info "Done! Installer: $EXE_PATH"
  ls -lh "$EXE_PATH"
else
  warn "Expected installer not found at $EXE_PATH, checking dist/..."
  ls -lh dist/*.exe 2>/dev/null || warn "No .exe files found in dist/"
fi
