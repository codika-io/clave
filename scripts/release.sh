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

# ── Signing keychain ───────────────────────────────────────────────
# We build the keychain ourselves rather than letting electron-builder do it.
# Its createKeychain() calls
#   security set-key-partition-list ... -k "$CSC_KEY_PASSWORD" <keychain>
# passing the CERTIFICATE's password where security expects the KEYCHAIN's (the
# latter being a random string it generates), and fails the build with a
# misleading "SecKeychainUnlock: the user name or passphrase you entered is not
# correct" — which reads as a bad CSC_KEY_PASSWORD secret and is not one.
#
# This worked in our CI for a long time and then stopped. The last green and
# first red builds differ only in the GitHub runner image (macos-26-arm64
# 20260728.0273 -> 20260831.0337): same code, same electron-builder 26.7.0, same
# credentials. We could not reproduce a passing set-key-partition-list with
# mismatched passwords locally, so what the old environment did differently is
# unexplained — the original logs expired before we could dig further. Verified:
# -k is validated against the keychain, the call is awaited unguarded so a
# failure is fatal, and the line is unchanged in 26.16.0, so upgrading is no fix.
#
# electron-builder skips its own keychain entirely when CSC_LINK is unset and
# uses CSC_KEYCHAIN as given (macPackager.js: `selected == null` →
# `{ keychainFile: process.env.CSC_KEYCHAIN }`), which is the seam we use: import
# the cert here, unlock it correctly, hand over the keychain, and unset CSC_LINK
# for the build so the buggy path is never entered.
setup_keychain() {
  local p12 keychain_pass
  KEYCHAIN="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/clave-signing-$$.keychain-db"
  keychain_pass="$(openssl rand -base64 24)"
  p12="$(mktemp -t clave-cert).p12"

  # CSC_LINK is a base64 .p12 in CI, a file path locally.
  if [[ -f "$CSC_LINK" ]]; then
    cp "$CSC_LINK" "$p12"
  else
    base64 --decode <<<"$CSC_LINK" > "$p12"
  fi

  security create-keychain -p "$keychain_pass" "$KEYCHAIN"
  # No -t/-u: clears the default lock-on-sleep timeout, so the keychain stays
  # usable for the whole build.
  security set-keychain-settings "$KEYCHAIN"
  security unlock-keychain -p "$keychain_pass" "$KEYCHAIN"

  security import "$p12" -k "$KEYCHAIN" -P "${CSC_KEY_PASSWORD:-}" \
    -T /usr/bin/codesign -T /usr/bin/productbuild >/dev/null
  rm -f "$p12"

  # -k takes the KEYCHAIN password — the argument electron-builder gets wrong.
  security set-key-partition-list -S apple-tool:,apple: -s \
    -k "$keychain_pass" "$KEYCHAIN" >/dev/null

  # Keep it on the search list so codesign can find the identity.
  security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')

  # Report what landed. Not fatal on its own: electron-builder fails clearly
  # enough if the identity is genuinely missing, and a mis-parse here should
  # never be what blocks a release.
  local found
  found=$(security find-identity -v -p codesigning "$KEYCHAIN" | grep -c "Developer ID Application" || true)
  if [[ "$found" -gt 0 ]]; then
    info "Signing keychain ready ($found Developer ID Application identity)"
  else
    warn "No Developer ID Application identity found after import — letting the build be the judge"
    security find-identity -v -p codesigning "$KEYCHAIN" || true
  fi
}

cleanup_keychain() {
  [[ -n "${KEYCHAIN:-}" && -f "$KEYCHAIN" ]] || return 0
  security list-keychains -d user -s $(security list-keychains -d user | tr -d '"' | grep -v "$KEYCHAIN") 2>/dev/null || true
  security delete-keychain "$KEYCHAIN" 2>/dev/null || true
}
trap cleanup_keychain EXIT

setup_keychain
export CSC_KEYCHAIN="$KEYCHAIN"
# Must be unset, or electron-builder creates its own keychain down the buggy path.
unset CSC_LINK CSC_KEY_PASSWORD

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
