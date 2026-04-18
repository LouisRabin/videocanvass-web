#!/bin/bash
# Double-click this file in Finder: Terminal opens in the repo folder and runs EndGit (same steps as EndGit.bat).
# First time: if macOS blocks it, right-click → Open, then confirm.

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1

set +e
bash "$HERE/EndGit.sh"
code=$?

echo ""
read -r -p "Press Enter to close this window..." _
exit "$code"
