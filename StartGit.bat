@echo off
setlocal

echo.
echo ============================================
echo   StartGit - Begin Work Session
echo ============================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] This folder is not a git repository.
  pause
  exit /b 1
)

echo [1/2] Pulling latest changes...
git pull
if errorlevel 1 (
  echo.
  echo [ERROR] git pull failed. Resolve and run again.
  pause
  exit /b 1
)

echo.
echo [2/2] Current status:
git status

echo.
echo [DONE] You're ready to work.
pause
