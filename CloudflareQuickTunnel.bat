@echo off
setlocal EnableExtensions
title VideoCanvass - Cloudflare quick tunnel
cd /d "%~dp0"

rem IMPORTANT: never use %%ProgramFiles(x86)%% inside "(" ... ")" blocks - the ")" breaks parsing.
set "PF86=%ProgramFiles(x86)%"

set "CF="
where cloudflared >nul 2>&1
if not errorlevel 1 set "CF=cloudflared"

if not defined CF if exist "%ProgramFiles%\Cloudflare\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\Cloudflare\cloudflared\cloudflared.exe"
if not defined CF if exist "%PF86%\cloudflared\cloudflared.exe" set "CF=%PF86%\cloudflared\cloudflared.exe"

if not defined CF (
  echo [ERROR] cloudflared not found. Install with:
  echo   winget install Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
  echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)

call "%~dp0WaitForDevServerPort.bat"
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo  Your public URL is printed below within a few seconds, after:
echo  "Your quick Tunnel has been created"
echo  Look for a line like: https://something.trycloudflare.com
echo.
echo  You may see ERR about cert.pem / origin certificate for quick tunnels - that is normal.
echo  If you see "Registered tunnel connection", the tunnel is up.
echo.
echo  Leave this window open while others use the link.
echo  Vite must allow trycloudflare hosts; see vite.config.ts. If the site fails to load, try mode G (ngrok).
echo ----------------------------------------------------------------
echo.

"%CF%" tunnel --url http://localhost:5173

echo.
echo ----------------------------------------------------------------
echo  Tunnel process ended.
pause
