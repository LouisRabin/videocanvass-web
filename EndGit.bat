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

echo [1/4] Staging all changes...
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
echo [2/4] Committing...
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo [INFO] Nothing to commit, or commit failed.
  git status
  pause
  exit /b 0
)

echo.
echo [3/4] Pushing...
git push
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed.
  pause
  exit /b 1
)

echo.
echo [4/4] Final status:
git status

echo.
echo [DONE] Work saved to GitHub.
pause
