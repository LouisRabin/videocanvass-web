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

echo [1/5] Staging all changes...
git add .
if errorlevel 1 (
  echo.
  echo [ERROR] git add failed.
  pause
  exit /b 1
)

echo.
set /p MSG=Enter commit message (leave blank to cancel): 
if "%MSG%"=="" (
  echo [CANCELLED] No commit message entered.
  pause
  exit /b 0
)

echo.
echo [2/5] Committing...
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo [INFO] Nothing to commit, or commit failed.
  git status
  pause
  exit /b 0
)

echo.
echo [3/5] Pushing branch...
git push
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed.
  pause
  exit /b 1
)

echo.
echo [4/5] Final status:
git status

echo.
echo [5/5] Optional version tag
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
echo [DONE] Work saved to GitHub.
pause
