@echo off
setlocal

echo.
echo ============================================
echo   StartGit - Begin Work Session
echo ============================================
echo.

set "REPO_URL=https://github.com/LouisRabin/videocanvass-web"

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [INFO] This folder is not a git repository yet.
  echo.
  echo Repo:
  echo   %REPO_URL%
  echo.
  choice /m "Clone the repo into the current folder?"
  if errorlevel 2 (
    echo [CANCELLED] Not cloning.
    pause
    exit /b 0
  )
  echo.
  echo Cloning...
  git clone "%REPO_URL%" .
  if errorlevel 1 (
    echo.
    echo [ERROR] git clone failed.
    pause
    exit /b 1
  )
)

echo Updating this folder:
echo   %CD%
echo.
echo Remote:
git remote remove origin >nul 2>&1
git remote add origin "%REPO_URL%" >nul 2>&1
git remote -v
echo.

echo Ensuring main branch tracking...
git fetch origin >nul 2>&1
git rev-parse --verify main >nul 2>&1
if errorlevel 1 (
  git checkout -B main origin/main >nul 2>&1
) else (
  git checkout main >nul 2>&1
)
git branch --set-upstream-to=origin/main main >nul 2>&1
echo.

echo [1/2] Pulling latest changes...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo [ERROR] git pull failed.
  echo If you have local commits, use a normal pull/merge or rebase manually.
  pause
  exit /b 1
)

echo.
echo [2/2] Current status:
git status

echo.
echo [DONE] You're ready to work.
pause
