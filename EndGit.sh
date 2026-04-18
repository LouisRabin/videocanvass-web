#!/usr/bin/env bash
# EndGit for macOS — same flow as EndGit.bat (finish session: optional cap:sync, add, commit, push, optional tag).
#
# From Terminal (repo folder):     chmod +x EndGit.sh   # once
#                                  ./EndGit.sh
# From Finder (double-click):     EndGit.command  (opens Terminal here; waits before closing)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo ""
echo "============================================"
echo "  EndGit - Finish Work Session (macOS)"
echo "============================================"
echo ""

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[ERROR] This folder is not a git repository."
  exit 1
fi

echo "[0/6] Capacitor native bundle (optional)"
echo "  ios/App/App/public and config files are gitignored — they are NOT pushed."
echo "  Run sync here so THIS machine has a fresh web build + ios/android copies before you commit."
echo "  After pull on another machine, run:  npm run cap:sync  (same reason)"
echo ""
read -r -p "Run npm run cap:sync now (npm run build + copy to ios/android)? [y/N] " capsync_ans
# macOS ships Bash 3.2 — no ${var,,}; normalize with tr for y/yes/Y/YES.
capsync_lc="$(printf '%s' "${capsync_ans:-}" | tr '[:upper:]' '[:lower:]')"
if [[ "${capsync_lc}" == "y" || "${capsync_lc}" == "yes" ]]; then
  if ! npm run cap:sync; then
    echo ""
    echo "[ERROR] npm run cap:sync failed. Fix the error, then run EndGit.sh again or continue without sync."
    exit 1
  fi
  echo "[OK] cap:sync finished."
fi

echo ""
echo "[1/6] Staging all changes..."
git add .

echo ""
read -r -p "Enter commit message (leave blank to cancel): " MSG
if [[ -z "${MSG}" ]]; then
  echo "[CANCELLED] No commit message entered."
  exit 0
fi

echo ""
echo "[2/6] Committing..."
if ! git commit -m "$MSG"; then
  echo ""
  echo "[INFO] Nothing to commit, or commit failed."
  git status
  exit 0
fi

echo ""
echo "[3/6] Pushing branch..."
if ! git push; then
  echo ""
  echo "[ERROR] git push failed."
  exit 1
fi

echo ""
echo "[4/6] Final status:"
git status

echo ""
echo "[5/6] Optional version tag"
echo "  Tags a snapshot of this exact commit on GitHub so you can restore it later"
echo "  (e.g. after more pushes). Use a simple name like address-working-v1 — no spaces is safest."
echo ""
read -r -p "Version tag name (leave blank to skip): " TAGNAME
if [[ -z "${TAGNAME}" ]]; then
  echo "[SKIP] No tag created."
else
  echo ""
  echo "Creating annotated tag \"${TAGNAME}\"..."
  if ! git tag -a "${TAGNAME}" -m "EndGit snapshot: ${TAGNAME}"; then
    echo "[ERROR] git tag failed. That name may already exist — pick another or delete the old tag."
    exit 1
  fi
  echo "Pushing tag to origin..."
  if ! git push origin "${TAGNAME}"; then
    echo "[ERROR] git push of tag failed."
    exit 1
  fi
  echo "[OK] Tag \"${TAGNAME}\" is on GitHub. Restore later with: git checkout \"${TAGNAME}\""
fi

echo ""
echo "[6/6] Reminder for Xcode / Mac after pull"
echo "  ios/App/App/public is NOT in Git. On the Mac run:  npm run cap:sync"
echo "  before building in Xcode (see docs/MOBILE_RELEASE.md)."

echo ""
echo "[DONE] Work saved to GitHub."
