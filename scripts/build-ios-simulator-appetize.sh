#!/usr/bin/env bash
# Build an iOS Simulator .app zip for https://appetize.io/upload
# Appetize does not accept device/App Store .ipa builds — see:
# https://docs.appetize.io/platform/app-management/uploading-apps/ios
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS with Xcode installed." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> npm run build && copy web assets into ios/"
npm run build
node "$ROOT/scripts/cap-copy-web.cjs"

DERIVED="$ROOT/ios/.appetize-derived"
rm -rf "$DERIVED"

echo "==> xcodebuild (iOS Simulator)"
xcodebuild \
  -project "$ROOT/ios/App/App.xcodeproj" \
  -scheme App \
  -sdk iphonesimulator \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED" \
  build

APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
if [[ ! -d "$APP" ]]; then
  echo "error: missing $APP" >&2
  exit 1
fi

mkdir -p "$ROOT/dist-appetize"
OUT="$ROOT/dist-appetize/VideoCanvass-ios-simulator.zip"
rm -f "$OUT"
( cd "$(dirname "$APP")" && zip -qr "$OUT" "$(basename "$APP")" )

echo ""
echo "Upload this file at https://appetize.io/upload :"
echo "  $OUT"
echo ""
