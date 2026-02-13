#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[release]${NC} $*"; }
warn()  { echo -e "${YELLOW}[release]${NC} $*"; }
error() { echo -e "${RED}[release]${NC} $*" >&2; exit 1; }

# ── Pre-flight checks ──────────────────────────────────────────────
command -v gh   >/dev/null 2>&1 || error "gh CLI not found. Install: brew install gh"
command -v node >/dev/null 2>&1 || error "node not found"
command -v npm  >/dev/null 2>&1 || error "npm not found"

BRANCH=$(git branch --show-current)
[[ "$BRANCH" == "main" ]] || error "Must be on 'main' branch (currently on '$BRANCH')"

if [[ -n $(git status --porcelain) ]]; then
  error "Working tree is dirty. Commit or stash changes first."
fi

git pull --ff-only origin main || error "Failed to pull latest changes"

CURRENT_VERSION=$(node -p "require('./package.json').version")
info "Current version: $CURRENT_VERSION"

# ── Version prompt ──────────────────────────────────────────────────
echo ""
echo "Enter version bump (patch, minor, major) or explicit semver (e.g. 1.2.3):"
read -rp "> " VERSION_INPUT

if [[ "$VERSION_INPUT" =~ ^(patch|minor|major)$ ]]; then
  npm version "$VERSION_INPUT" --no-git-tag-version >/dev/null
  NEW_VERSION=$(node -p "require('./package.json').version")
else
  # Validate semver format
  if [[ ! "$VERSION_INPUT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    error "Invalid version: '$VERSION_INPUT'. Use patch/minor/major or X.Y.Z"
  fi
  npm version "$VERSION_INPUT" --no-git-tag-version >/dev/null
  NEW_VERSION="$VERSION_INPUT"
fi

info "Bumped version: $CURRENT_VERSION → $NEW_VERSION"

# ── Build ───────────────────────────────────────────────────────────
info "Building..."

if [[ -f .env ]]; then
  info "Sourcing .env"
  set -a; source .env; set +a
fi

npm run build:mac

# ── Verify artifacts ────────────────────────────────────────────────
DMG=$(ls dist/clave-"${NEW_VERSION}".dmg 2>/dev/null || true)
ZIP=$(ls dist/clave-"${NEW_VERSION}"-mac.zip 2>/dev/null || true)
YML=$(ls dist/latest-mac.yml 2>/dev/null || true)
BLOCKMAP=$(ls dist/clave-"${NEW_VERSION}".dmg.blockmap 2>/dev/null || true)

[[ -n "$DMG" ]] || error "DMG not found in dist/"
[[ -n "$ZIP" ]] || error "ZIP not found in dist/"
[[ -n "$YML" ]] || error "latest-mac.yml not found in dist/"

info "Build artifacts:"
ls -lh "$DMG" "$ZIP" "$YML" ${BLOCKMAP:+"$BLOCKMAP"}
echo ""

# ── Confirm ─────────────────────────────────────────────────────────
read -rp "Publish v${NEW_VERSION} to GitHub Releases? (y/N) " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { warn "Aborted."; git checkout -- package.json package-lock.json; exit 0; }

# ── Commit, tag, push ──────────────────────────────────────────────
git add package.json package-lock.json
git commit -m "chore: bump version to ${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"
git push origin main --follow-tags

# ── Create GitHub Release ───────────────────────────────────────────
ASSETS=("$DMG" "$ZIP" "$YML")
[[ -n "$BLOCKMAP" ]] && ASSETS+=("$BLOCKMAP")

gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION}" \
  --generate-notes \
  "${ASSETS[@]}"

info "Release v${NEW_VERSION} published!"
info "https://github.com/codika-io/clave/releases/tag/v${NEW_VERSION}"
