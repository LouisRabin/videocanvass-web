@echo off
REM From repo ios folder: build web + copy into native projects (Windows-friendly; no npx cap).
REM On Mac for Xcode, prefer RunIosPrep.command (runs cap:sync:ios).
setlocal
cd /d "%~dp0\.."
if not exist package.json (
  echo [ERROR] package.json not found. This script must live in the ios folder of the repo.
  pause
  exit /b 1
)
echo Repo: %CD%
echo Running: npm run cap:sync
echo.
call npm run cap:sync
if errorlevel 1 (
  echo.
  echo [ERROR] cap:sync failed.
  pause
  exit /b 1
)
echo.
echo [OK] Done.
pause
