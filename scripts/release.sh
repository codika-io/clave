#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[release]${NC} $*"; }
warn()  { echo -e "${YELLOW}[release]${NC} $*"; }
error() { echo -e "${RED}[release]${NC} $*" >&2; exit 1; }

RELEASE_BRANCH="prod"

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
  1. Bump version in package.json
  2. Roll CHANGELOG.md [Unreleased] into the new version heading
  3. Stamp "next" entries in whats-new.json with the new version
  4. Commit (with "chore: bump version to X.Y.Z")
  5. Build, sign, and notarize the macOS app
  6. Tag, push, and create a GitHub Release (changelog section as notes)

Runs locally (sources .env for signing credentials) and in CI (credentials
from the environment; set CI=true, which GitHub Actions does automatically).
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
if [[ "$BRANCH" != "$RELEASE_BRANCH" ]]; then
  # CI checks out a detached SHA of the release branch; resolve it.
  if [[ -n "${CI:-}" && -z "$BRANCH" ]]; then
    git checkout "$RELEASE_BRANCH"
  else
    error "Must be on '$RELEASE_BRANCH' branch (currently on '${BRANCH:-detached}')"
  fi
fi

if [[ -n "${CI:-}" ]]; then
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
fi

git fetch origin "$RELEASE_BRANCH"
git merge --ff-only "origin/$RELEASE_BRANCH" || error "Failed to fast-forward to origin/$RELEASE_BRANCH"

# ── Bump version ───────────────────────────────────────────────────
CURRENT_VERSION=$(node -p "require('./package.json').version")

if [[ -n "$BUMP" ]]; then
  npm version "$BUMP" --no-git-tag-version >/dev/null
else
  npm version "$EXPLICIT_VERSION" --no-git-tag-version >/dev/null
fi

NEW_VERSION=$(node -p "require('./package.json').version")
info "Version: $CURRENT_VERSION → $NEW_VERSION"

# ── Roll CHANGELOG.md: [Unreleased] → [X.Y.Z] — date ──────────────
# Extract the unreleased body (between "## [Unreleased]" and the next "## [").
NOTES_FILE="$(mktemp)"
awk '/^## \[Unreleased\]/{flag=1; next} /^## \[/{flag=0} flag' CHANGELOG.md \
  | sed -e '/./,$!d' > "$NOTES_FILE"

if [[ -s "$NOTES_FILE" ]]; then
  TODAY=$(date +%Y-%m-%d)
  perl -0pi -e "s/## \[Unreleased\]\n/## [Unreleased]\n\n## [${NEW_VERSION}] — ${TODAY}\n/" CHANGELOG.md
  info "CHANGELOG.md: rolled [Unreleased] into [${NEW_VERSION}]"
else
  warn "CHANGELOG.md has no [Unreleased] entries — release notes will be auto-generated"
fi

# ── Stamp whats-new.json: "next" → new version ────────────────────
WHATS_NEW="src/renderer/src/help/whats-new.json"
if [[ -f "$WHATS_NEW" ]] && grep -q '"version": "next"' "$WHATS_NEW"; then
  node -e "
    const fs = require('fs');
    const p = '$WHATS_NEW';
    const entries = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const e of entries) if (e.version === 'next') e.version = '$NEW_VERSION';
    fs.writeFileSync(p, JSON.stringify(entries, null, 2) + '\n');
  "
  info "whats-new.json: stamped 'next' entries as ${NEW_VERSION}"
fi

# ── Commit all changes (version bump + any staged/unstaged work) ──
git add -A
# [skip ci] guards against workflow recursion when CI pushes this commit back.
git commit -m "chore: bump version to ${NEW_VERSION} [skip ci]"
info "Committed version bump"

# ── Build ──────────────────────────────────────────────────────────
info "Building macOS app (this takes a few minutes)..."

if [[ -f .env ]]; then
  info "Sourcing .env for signing credentials"
  set -a; source .env; set +a
elif [[ -z "${CSC_LINK:-}" ]]; then
  error "No .env and no CSC_LINK in the environment — cannot sign"
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
git push origin "$RELEASE_BRANCH" --follow-tags
info "Pushed v${NEW_VERSION} to origin"

ASSETS=("$DMG" "$ZIP" "$YML")
[[ -n "$BLOCKMAP" ]] && ASSETS+=("$BLOCKMAP")
[[ -n "$ZIP_BLOCKMAP" ]] && ASSETS+=("$ZIP_BLOCKMAP")

if [[ -s "$NOTES_FILE" ]]; then
  gh release create "v${NEW_VERSION}" \
    --title "v${NEW_VERSION}" \
    --notes-file "$NOTES_FILE" \
    "${ASSETS[@]}"
else
  gh release create "v${NEW_VERSION}" \
    --title "v${NEW_VERSION}" \
    --generate-notes \
    "${ASSETS[@]}"
fi
rm -f "$NOTES_FILE"

info "Release v${NEW_VERSION} published!"
info "https://github.com/codika-io/clave/releases/tag/v${NEW_VERSION}"
