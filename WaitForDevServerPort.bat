@echo off
setlocal EnableExtensions
rem Waits until TCP localhost:5173 accepts connections (Vite --host 0.0.0.0 still listens on 127.0.0.1).
set "WF_PORT=5173"
set "WF_TIMEOUT=180"

echo Waiting for port %WF_PORT% (start Vite from StartDevServer.bat in the other window^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=%WF_PORT%; $m=%WF_TIMEOUT%; for ($i=0; $i -lt $m; $i++) { try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); Write-Host ('Port ' + $p + ' is ready.'); exit 0 } catch { } Start-Sleep -Seconds 1 }; Write-Host ('[ERROR] No listener on port ' + $p + ' after ' + $m + ' s.'); exit 1"
set "WF_EC=%ERRORLEVEL%"
if not "%WF_EC%"=="0" exit /b 1
exit /b 0
