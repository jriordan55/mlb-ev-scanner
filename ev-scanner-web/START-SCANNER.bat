@echo off
title MLB +EV Scanner
cd /d "%~dp0"

echo.
echo  ========================================
echo   MLB +EV Scanner - starting server
echo  ========================================
echo.
echo  1. Wait until you see: MLB EV scanner web: http://127.0.0.1:3847
echo  2. Open Chrome or Edge and go to:  http://127.0.0.1:3847
echo  3. First load can take 1-2 minutes (big download).
echo  4. To STOP: close this window or press Ctrl+C
echo.

set MLB_SCANNER_PORT=3847
node server.mjs
if errorlevel 1 (
  echo.
  echo  Port 3847 may be busy. Trying 3848...
  set MLB_SCANNER_PORT=3848
  node server.mjs
)

echo.
pause
