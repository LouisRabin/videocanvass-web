@echo off
setlocal

echo.
echo ============================================
echo   VideoCanvass - Start Dev Server
echo ============================================
echo.

cd /d "%~dp0"

if not exist "package.json" (
  echo [ERROR] package.json not found.
  echo Put this .bat in your project root folder.
  pause
  exit /b 1
)

echo [1/3] Checking dependencies...
if not exist "node_modules" (
  echo node_modules not found. Installing...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo node_modules found. Skipping install.
)

echo.

:run_server
echo [2/3] Starting Vite dev server (bound to all interfaces for LAN access^)...
echo.
echo This PC  -^> http://localhost:5173/
echo.
echo Same Wi-Fi/Ethernet -^> share one of these with another device:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress | Sort-Object -Unique | ForEach-Object { Write-Host ('           http://' + $_ + ':5173/') }"
echo.
echo If a phone or PC cannot connect: allow TCP port 5173 in Windows Firewall (Private^).
echo Vite will also print a Network: line below after it starts.
echo To stop cleanly, press Q then Enter in this window.
echo (Avoid Ctrl+C here, Windows may terminate the whole batch script.)
echo.

if exist "node_modules\vite\bin\vite.js" (
  node "node_modules\vite\bin\vite.js" --host 0.0.0.0 --port 5173
) else (
  call npm.cmd run dev:lan
)
set "DEV_EXIT=%ERRORLEVEL%"

echo.
echo Dev server stopped (exit code: %DEV_EXIT%).
choice /c RX /m "Press R to restart dev server, or X to exit"
if errorlevel 2 goto end
if errorlevel 1 goto run_server

:end
echo.
echo [3/3] Exiting StartDevServer.
pause
