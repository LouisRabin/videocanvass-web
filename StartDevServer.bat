@echo off
setlocal

echo.
echo ============================================
echo   VideoCanvass - Start Dev Server
echo ============================================
echo.

cd /d "%~dp0"
set "VCROOT=%~dp0"
set "TUNNEL_MODE=none"
set "TUNNEL_STARTED=0"

if not exist "package.json" (
  echo [ERROR] package.json not found.
  echo Put this .bat in your project root folder.
  pause
  exit /b 1
)

echo [1/3] Checking dependencies...
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo Install Node LTS from https://nodejs.org/ then retry.
  pause
  exit /b 1
)
node "%~dp0scripts\ensure-deps.mjs"
if errorlevel 1 (
  echo.
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Optional out-of-network tunnel:
echo   N = none (LAN only)
echo   C = Cloudflare tunnel (cloudflared)
echo   G = ngrok tunnel
choice /c NCG /m "Choose tunnel mode"
rem CHOICE: N=1, C=2, G=3. IF ERRORLEVEL is GTE - use goto so G does not fall through to C.
set "TUNNEL_MODE=none"
if errorlevel 3 goto tunnel_pick_g
if errorlevel 2 goto tunnel_pick_c
goto tunnel_pick_done
:tunnel_pick_g
set "TUNNEL_MODE=ngrok"
goto tunnel_pick_done
:tunnel_pick_c
set "TUNNEL_MODE=cloudflared"
:tunnel_pick_done
echo Selected tunnel mode: %TUNNEL_MODE%
echo.

:run_server
if /I not "%TUNNEL_MODE%"=="none" if "%TUNNEL_STARTED%"=="0" call :start_tunnel
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
exit /b 0

:start_tunnel
if /I not "%TUNNEL_MODE%"=="cloudflared" goto start_tunnel_ngrok
echo Starting Cloudflare tunnel in a new window...
echo That window waits until Vite is listening on port 5173, then starts cloudflared.
echo Logs (and the trycloudflare.com URL) print there - scroll up if the window filled quickly.
rem No parentheses here: avoids CMD block-parsing bugs. Explicit COMSPEC + CALL + full path.
if not exist "%VCROOT%CloudflareQuickTunnel.bat" (
  echo [ERROR] Missing "%VCROOT%CloudflareQuickTunnel.bat"
  pause
  exit /b 0
)
start "CF tunnel" /D "%VCROOT%" "%ComSpec%" /k call "%VCROOT%CloudflareQuickTunnel.bat"
set "TUNNEL_STARTED=1"
exit /b 0

:start_tunnel_ngrok
if /I not "%TUNNEL_MODE%"=="ngrok" exit /b 0
where ngrok >nul 2>&1
if errorlevel 1 (
  echo [WARN] ngrok not found. Continuing without out-of-network tunnel.
  set "TUNNEL_MODE=none"
  exit /b 0
)
if not exist "%VCROOT%NgrokQuickTunnel.bat" (
  echo [ERROR] Missing "%VCROOT%NgrokQuickTunnel.bat"
  pause
  exit /b 0
)
echo Starting ngrok tunnel in a new window...
echo That window waits for port 5173, then runs ngrok. The public URL appears there.
start "ngrok tunnel" /D "%VCROOT%" "%ComSpec%" /k call "%VCROOT%NgrokQuickTunnel.bat"
set "TUNNEL_STARTED=1"
exit /b 0
