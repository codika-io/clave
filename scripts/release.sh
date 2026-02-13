#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[release]${NC} $*"; }
warn()  { echo -e "${YELLOW}[release]${NC} $*"; }
error() { echo -e "${RED}[release]${NC} $*" >&2; exit 1; }

# ── Usage ──────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 [--patch | --minor | --major | --version X.Y.Z]

Flags:
  --patch          Bump patch version (e.g. 1.1.1 → 1.1.2)
  --minor          Bump minor version (e.g. 1.1.1 → 1.2.0)
  --major          Bump major version (e.g. 1.1.1 → 2.0.0)
  --version X.Y.Z  Set explicit version
  --help           Show this help

The script will:
  1. Commit any uncommitted changes (with "chore: bump version to X.Y.Z")
  2. Bump version in package.json
  3. Build, sign, and notarize the macOS app
  4. Tag, push, and create a GitHub Release
EOF
  exit 0
}

# ── Parse args ─────────────────────────────────────────────────────
BUMP=""
EXPLICIT_VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --patch) BUMP="patch"; shift ;;
    --minor) BUMP="minor"; shift ;;
    --major) BUMP="major"; shift ;;
    --version)
      [[ -n "${2:-}" ]] || error "--version requires a semver argument (e.g. 1.2.3)"
      EXPLICIT_VERSION="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) error "Unknown flag: $1. Use --help for usage." ;;
  esac
done

[[ -n "$BUMP" || -n "$EXPLICIT_VERSION" ]] || {
  error "No version bump specified. Use --patch, --minor, --major, or --version X.Y.Z"
}

if [[ -n "$EXPLICIT_VERSION" ]]; then
  [[ "$EXPLICIT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || \
    error "Invalid version: '$EXPLICIT_VERSION'. Must be X.Y.Z"
fi

# ── Pre-flight checks ─────────────────────────────────────────────
command -v gh   >/dev/null 2>&1 || error "gh CLI not found. Install: brew install gh"
command -v node >/dev/null 2>&1 || error "node not found"
command -v npm  >/dev/null 2>&1 || error "npm not found"

BRANCH=$(git branch --show-current)
[[ "$BRANCH" == "main" ]] || error "Must be on 'main' branch (currently on '$BRANCH')"

git pull --ff-only origin main || error "Failed to pull latest changes"

# ── Bump version ───────────────────────────────────────────────────
CURRENT_VERSION=$(node -p "require('./package.json').version")

if [[ -n "$BUMP" ]]; then
  npm version "$BUMP" --no-git-tag-version >/dev/null
else
  npm version "$EXPLICIT_VERSION" --no-git-tag-version >/dev/null
fi

NEW_VERSION=$(node -p "require('./package.json').version")
info "Version: $CURRENT_VERSION → $NEW_VERSION"

# ── Commit all changes (version bump + any staged/unstaged work) ──
git add -A
git commit -m "chore: bump version to ${NEW_VERSION}"
info "Committed version bump"

# ── Build ──────────────────────────────────────────────────────────
info "Building macOS app (this takes a few minutes)..."

if [[ -f .env ]]; then
  info "Sourcing .env for signing credentials"
  set -a; source .env; set +a
fi

npm run build:mac

# ── Verify artifacts ───────────────────────────────────────────────
DMG=$(ls dist/clave-"${NEW_VERSION}".dmg 2>/dev/null || true)
ZIP=$(ls dist/Clave-"${NEW_VERSION}"-universal-mac.zip 2>/dev/null || true)
YML=$(ls dist/latest-mac.yml 2>/dev/null || true)
BLOCKMAP=$(ls dist/clave-"${NEW_VERSION}".dmg.blockmap 2>/dev/null || true)
ZIP_BLOCKMAP=$(ls dist/Clave-"${NEW_VERSION}"-universal-mac.zip.blockmap 2>/dev/null || true)

[[ -n "$DMG" ]] || error "DMG not found in dist/"
[[ -n "$ZIP" ]] || error "ZIP not found in dist/"
[[ -n "$YML" ]] || error "latest-mac.yml not found in dist/"

info "Build artifacts:"
ls -lh "$DMG" "$ZIP" "$YML" ${BLOCKMAP:+"$BLOCKMAP"} ${ZIP_BLOCKMAP:+"$ZIP_BLOCKMAP"}

# ── Tag, push, release ────────────────────────────────────────────
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"
git push origin main --follow-tags
info "Pushed v${NEW_VERSION} to origin"

ASSETS=("$DMG" "$ZIP" "$YML")
[[ -n "$BLOCKMAP" ]] && ASSETS+=("$BLOCKMAP")
[[ -n "$ZIP_BLOCKMAP" ]] && ASSETS+=("$ZIP_BLOCKMAP")

gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION}" \
  --generate-notes \
  "${ASSETS[@]}"

info "Release v${NEW_VERSION} published!"
info "https://github.com/codika-io/clave/releases/tag/v${NEW_VERSION}"
