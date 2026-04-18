@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================
echo   EndGit - Finish Work Session
echo ============================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] This folder is not a git repository.
  pause
  exit /b 1
)

echo [0/6] Capacitor native bundle ^(optional^)
echo   ios/App/App/public and config files are gitignored - they are NOT pushed.
echo   Run sync here so THIS machine has a fresh web build + ios/android copies before you commit.
echo   On Mac after pull, run:  npm run cap:sync   ^(same reason^)
echo.
echo Run npm run cap:sync now ^(build + copy to ios/android^)?
set "VC_CAPSYNC="
rem Read from CON so stdin is not whatever npm/choice left on the buffer.
set /p VC_CAPSYNC=Type Y or N then Enter [y/N]: <CON
set "VC_1=!VC_CAPSYNC:~0,1!"
if /i "!VC_1!"=="Y" (
  call npm run cap:sync
  if errorlevel 1 (
    echo.
    echo [ERROR] npm run cap:sync failed. Fix the error, then run EndGit again or continue without sync.
    pause
    exit /b 1
  )
  echo [OK] cap:sync finished.
) else (
  echo [SKIP] cap:sync not run.
)

echo.
echo [1/6] Staging all changes...
git add .
if errorlevel 1 (
  echo.
  echo [ERROR] git add failed.
  pause
  exit /b 1
)

echo.
echo Tip: Type a short commit message on the line below, then press Enter.
echo       Leave the line empty to cancel ^(no commit, no push^).
echo.
set "VC_COMMIT_MSG="
rem ^<CON forces the real console; avoids set /p seeing a drained or piped stdin after npm/choice.
set /p VC_COMMIT_MSG=Commit message: <CON
if "!VC_COMMIT_MSG!"=="" (
  echo [CANCELLED] No commit message entered.
  pause
  exit /b 0
)

echo.
echo [2/6] Committing...
git commit -m "!VC_COMMIT_MSG!"
if errorlevel 1 (
  echo.
  echo [INFO] Nothing to commit, or commit failed.
  git status
  pause
  exit /b 0
)

echo.
echo [3/6] Pushing branch...
set "GITBR="
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "GITBR=%%B"
if "!GITBR!"=="" (
  echo.
  echo [ERROR] No current branch name ^(detached HEAD?^). Checkout a branch, then push manually.
  pause
  exit /b 1
)
echo   Remote: origin - Branch: !GITBR!
rem First push on a clone often has no upstream - plain git push fails. -u sets tracking once.
git push -u origin !GITBR!
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed ^(network, auth, or remote name not "origin"^).
  pause
  exit /b 1
)

echo.
echo [4/6] Final status:
git status

echo.
echo [5/6] Optional version tag
echo   Tags a snapshot of this exact commit on GitHub so you can restore it later
echo   ^(e.g. after more pushes^). Use a simple name like address-working-v1 - no spaces is safest.
echo.
echo Version tag ^(leave blank to skip^):
set "TAGNAME="
set /p TAGNAME=Tag name: <CON
if "!TAGNAME!"=="" (
  echo [SKIP] No tag created.
) else (
  echo.
  echo Creating annotated tag "!TAGNAME!"...
  git tag -a "!TAGNAME!" -m "EndGit snapshot: !TAGNAME!"
  if errorlevel 1 (
    echo [ERROR] git tag failed. That name may already exist - pick another or delete the old tag.
    pause
    exit /b 1
  )
  echo Pushing tag to origin...
  git push origin "!TAGNAME!"
  if errorlevel 1 (
    echo [ERROR] git push of tag failed.
    pause
    exit /b 1
  )
  echo [OK] Tag "!TAGNAME!" is on GitHub. Restore later with: git checkout "!TAGNAME!"
)

echo.
echo [6/6] Reminder for Xcode / Mac after pull
echo   ios/App/App/public is NOT in Git. On the Mac run:  npm run cap:sync
echo   before building in Xcode ^(see docs/MOBILE_RELEASE.md^).

echo.
echo [DONE] Work saved to GitHub.
pause
