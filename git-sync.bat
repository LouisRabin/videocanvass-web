@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================
echo   VideoCanvass Git Sync
echo ============================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] This folder is not a git repository.
  echo Open this .bat from your project root folder.
  pause
  exit /b 1
)

echo [1/4] Pulling latest changes...
git pull
if errorlevel 1 (
  echo.
  echo [ERROR] git pull failed. Resolve issues, then try again.
  pause
  exit /b 1
)

echo.
echo [2/4] Staging all changes...
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
echo [3/4] Committing...
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo [INFO] Nothing to commit, or commit failed.
  echo Running status for details:
  git status
  pause
  exit /b 0
)

echo.
echo [4/4] Pushing to GitHub...
git push
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed.
  pause
  exit /b 1
)

echo.
echo [DONE] Sync complete.
git status
echo.
pause
