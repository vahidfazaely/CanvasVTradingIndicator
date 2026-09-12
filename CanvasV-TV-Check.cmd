@echo off
title CanvasV TradingView Auto-Check - v4.3.0
cd /d "%~dp0tv-automation"

echo ============================================================
echo   CanvasV TradingView Auto-Check
echo   Loads CanvasV_V4_FAST.pine into TradingView (Chrome)
echo   and reports COMPILES CLEAN or the compile errors.
echo   Needs: Windows + Google Chrome + Node.js + internet
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install it from https://nodejs.org first.
  pause
  exit /b 1
)

if not exist "node_modules\playwright-core" (
  echo Installing playwright-core (one-time)...
  call npm install
  echo.
)

node verify-full.mjs
echo.
pause
