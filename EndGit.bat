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
choice /c YN /m "Run npm run cap:sync now (npm run build + copy to ios/android)?"
if errorlevel 2 goto skip_capsync
if errorlevel 1 (
  call npm run cap:sync
  if errorlevel 1 (
    echo.
    echo [ERROR] npm run cap:sync failed. Fix the error, then run EndGit again or continue without sync.
    pause
    exit /b 1
  )
  echo [OK] cap:sync finished.
)
:skip_capsync

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
echo Tip: You must type a commit message. Pressing Enter with an empty line cancels ^(by design^).
set /p MSG=Enter commit message (leave blank to cancel): 
if "%MSG%"=="" (
  echo [CANCELLED] No commit message entered.
  pause
  exit /b 0
)

echo.
echo [2/6] Committing...
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo [INFO] Nothing to commit, or commit failed.
  git status
  pause
  exit /b 0
)

echo.
echo [3/6] Pushing branch...
git push
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed.
  pause
  exit /b 1
)

echo.
echo [4/6] Final status:
git status

echo.
echo [5/6] Optional version tag
echo   Tags a snapshot of this exact commit on GitHub so you can restore it later
echo   ^(e.g. after more pushes^). Use a simple name like address-working-v1 — no spaces is safest.
echo.
set /p TAGNAME=Version tag name ^(leave blank to skip^): 
if "!TAGNAME!"=="" (
  echo [SKIP] No tag created.
) else (
  echo.
  echo Creating annotated tag "!TAGNAME!"...
  git tag -a "!TAGNAME!" -m "EndGit snapshot: !TAGNAME!"
  if errorlevel 1 (
    echo [ERROR] git tag failed. That name may already exist — pick another or delete the old tag.
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
