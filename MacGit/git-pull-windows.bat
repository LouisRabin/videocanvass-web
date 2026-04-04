@echo off
setlocal
cd /d "%~dp0\.."

echo Repository: %CD%
echo.
git fetch origin
git pull origin main
if errorlevel 1 (
  echo.
  echo Pull failed.
  pause
  exit /b 1
)

echo.
echo Done: pulled origin main
echo.
echo Optional — refresh Node deps after pull:
echo   npm install
echo   npm run build
echo.
pause
