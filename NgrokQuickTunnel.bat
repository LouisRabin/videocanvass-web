@echo off
setlocal EnableExtensions
title VideoCanvass - ngrok tunnel
cd /d "%~dp0"

where ngrok >nul 2>&1
if errorlevel 1 (
  echo [ERROR] ngrok not found. Install from https://ngrok.com/download and ensure ngrok is on PATH.
  pause
  exit /b 1
)

call "%~dp0WaitForDevServerPort.bat"
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo  Public URL appears below. Leave this window open while others use the link.
echo ----------------------------------------------------------------
echo.

ngrok http 5173

echo.
echo ----------------------------------------------------------------
echo  ngrok ended.
pause
