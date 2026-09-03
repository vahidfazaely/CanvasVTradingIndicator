@echo off
title CanvasV Quick Tests
cd /d "%~dp0backtest"

:menu
cls
echo ============================================================
echo   CanvasV Quick Tests
echo   (runs the backtest engine on your saved M15 data)
echo ============================================================
echo.
echo   1) BTCUSDT  - production baseline (default settings)
echo   2) ETHUSDT  - production baseline
echo   3) SOLUSDT  - production baseline
echo   4) BTCUSDT  - compare: tighter stop (1.0) vs current (1.5)
echo   5) Full stop-width hold-out report - all 3 symbols
echo   6) SOL second-half R1 forensics report
echo.
echo   0) Close
echo ============================================================
echo.
set /p pick=Type a number and press Enter: 

if "%pick%"=="1" goto btc
if "%pick%"=="2" goto eth
if "%pick%"=="3" goto sol
if "%pick%"=="4" goto ab
if "%pick%"=="5" goto atrstop
if "%pick%"=="6" goto solr1
if "%pick%"=="0" exit
goto menu

:btc
node simple-test.mjs BTCUSDT
pause
goto menu

:eth
node simple-test.mjs ETHUSDT
pause
goto menu

:sol
node simple-test.mjs SOLUSDT
pause
goto menu

:ab
node simple-test.mjs BTCUSDT --vs atrStopMult=1.0
pause
goto menu

:atrstop
node atrstop-ab.mjs
pause
goto menu

:solr1
node r1-sol-forensics.mjs
pause
goto menu
