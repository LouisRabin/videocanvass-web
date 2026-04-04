@echo off
setlocal
cd /d "%~dp0\.."
if "%~1"=="" (
  echo.
  echo Usage:  git-push-windows.bat "Your commit message"
  echo.
  echo Stages all changes, commits to main, and pushes to origin.
  pause
  exit /b 1
)

echo Repository: %CD%
echo.
git status -sb
echo.
git add -A
git commit -m "%*"
if errorlevel 1 (
  echo.
  echo Commit failed (nothing to commit^?^). Trying push anyway...
  echo.
)
git push origin main
if errorlevel 1 (
  echo.
  echo Push failed.
  pause
  exit /b 1
)
echo.
echo Done: pushed origin main
pause
