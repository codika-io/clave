#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
APP_PATH="dist/mac-arm64/Clave.app"
DEFAULT_DMG_PATH="dist/clave-${VERSION}.dmg"
DEFAULT_BLOCKMAP_PATH="${DEFAULT_DMG_PATH}.blockmap"
TEST_DMG_PATH="dist/clave-${VERSION}-mac-test-arm64.dmg"
TEST_BLOCKMAP_PATH="${TEST_DMG_PATH}.blockmap"

echo "== Building app bundles =="
npm run build
npx electron-builder --dir --mac --arm64 \
  -c.mac.icon=build/icon.icns \
  -c.mac.notarize=false \
  -c.mac.hardenedRuntime=false \
  -c.mac.gatekeeperAssess=false \
  -c.mac.identity=null

echo "== Re-signing app bundle for local testing =="
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "== Packaging DMG =="
npx electron-builder --prepackaged "$APP_PATH" --mac dmg --arm64 \
  -c.mac.icon=build/icon.icns \
  -c.mac.notarize=false \
  -c.mac.hardenedRuntime=false \
  -c.mac.gatekeeperAssess=false \
  -c.mac.identity=null

cp -f "$DEFAULT_DMG_PATH" "$TEST_DMG_PATH"
cp -f "$DEFAULT_BLOCKMAP_PATH" "$TEST_BLOCKMAP_PATH"

echo "== Done =="
echo "App:  $APP_PATH"
echo "DMG:  $TEST_DMG_PATH"
