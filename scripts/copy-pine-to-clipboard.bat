@echo off
REM ============================================================
REM  CanvasV MTF Signal - copy the Pine source to the clipboard
REM  so it can be pasted straight into the TradingView Pine
REM  Editor.
REM
REM  Usage (double-click, or run from any shell):
REM      scripts\copy-pine-to-clipboard.bat
REM
REM  Then in the Pine Editor:  Ctrl+A  ->  Ctrl+V  ->  Ctrl+S
REM  The panel must show the current version (e.g. v3.4.2).
REM ============================================================
setlocal
set "PINE=%~dp0..\TradingView\MyBuySellIndicator.pine"
if not exist "%PINE%" (
    echo ERROR: file not found: %PINE%
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c = Get-Content -Raw -Encoding UTF8 '%PINE%';" ^
  "Set-Clipboard -Value $c;" ^
  "Write-Host ('Copied ' + $c.Length + ' chars to the clipboard.')"
if %errorlevel% neq 0 (
    echo ERROR: clipboard copy failed.
    exit /b 1
)
echo.
echo Now in TradingView - Pine Editor:
echo   1. Ctrl+A   select everything
echo   2. Ctrl+V   paste
echo   3. Ctrl+S   save
echo The panel should read the current version after compile.
endlocal
