#!/bin/bash
# Double-click in Finder: builds web + runs Capacitor sync for iOS (from repo root).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "Repo: $ROOT"
echo "Running: npm run cap:sync:ios"
echo ""
npm run cap:sync:ios
echo ""
echo "Done. Press Enter to close this window."
read -r _
