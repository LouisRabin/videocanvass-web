#!/usr/bin/env bash
# Run on macOS after editing files there. Stages all, commits, pushes to origin main.
# Usage: ./MacGit/git-push-mac.sh "Your commit message"
# First time: chmod +x MacGit/git-push-mac.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
  echo ""
  echo "Usage:  $0 \"Your commit message\""
  echo ""
  echo "Stages all changes, commits to main, and pushes to origin."
  exit 1
fi

MSG="$*"

echo "Repository: $ROOT"
echo ""
git status -sb
echo ""
git add -A
git commit -m "$MSG" || (
  echo ""
  echo "Commit failed (nothing to commit?). Trying push anyway..."
  echo ""
)
git push origin main
echo ""
echo "Done: pushed origin main"
