#!/usr/bin/env bash
# Run on macOS from Terminal. Pulls latest main, installs deps, builds web, syncs Capacitor iOS.
# First time: chmod +x MacGit/git-pull-mac.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Repository: $ROOT"
echo ""

git fetch origin
git pull origin main

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

npm run build
npx cap sync ios

echo ""
echo "Done. Open iOS in Xcode with:"
echo "  cd \"$ROOT\" && npx cap open ios"
echo "  (or open ios/App/App.xcworkspace if it exists)"
echo ""

read -r -p "Run 'npx cap open ios' now? [y/N] " ans
case "$ans" in
  y|Y|yes|YES) (cd "$ROOT" && npx cap open ios) ;;
esac
