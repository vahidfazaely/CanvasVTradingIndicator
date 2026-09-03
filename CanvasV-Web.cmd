@echo off
title CanvasV Web Test Lab - close this window to stop the server
cd /d "%~dp0backtest"
node web-test.mjs --open
pause
