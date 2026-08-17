@echo off
REM ============================================================
REM  CanvasV MTF Signal - log collector
REM
REM  Appends whatever is on the clipboard (a CVLOG/CVOUT line
REM  copied from a TradingView alert) to logs\cvlog.txt, with a
REM  local timestamp prefix.
REM
REM  Usage:
REM    1. In TradingView, open the Alert Log (or your alert
REM       email/webhook) and copy ONE CVLOG|... or CVOUT|... line.
REM    2. Double-click this file. The line is appended.
REM    3. Repeat for the next line. Type q + Enter to quit.
REM
REM  When you have ~20 lines, send the whole logs\cvlog.txt
REM  file (or paste it) for analysis.
REM ============================================================
setlocal
set "DIR=%~dp0..\logs"
if not exist "%DIR%" mkdir "%DIR%"
set "OUT=%DIR%\cvlog.txt"

:loop
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss';" ^
  "$c = ((Get-Clipboard) -join \"`n\").Trim();" ^
  "if ($c -eq '') { Write-Host 'Clipboard is empty - copy a CVLOG/CVOUT line first.'; exit 1 }" ^
  "Add-Content -Path '%OUT%' -Value ($t + '  ' + $c) -Encoding UTF8;" ^
  "Write-Host ('Appended: ' + $c.Substring(0, [Math]::Min(60, $c.Length)) + ' ...')"
if errorlevel 1 (
    echo.
    echo Nothing appended.
    goto ask
)
echo.
echo Line appended to %OUT%
echo.

:ask
set "again="
set /p again=Copy the next line, then press Enter to append (q + Enter to quit): 
if /i "%again%"=="q" goto :eof
if not "%again%"=="" goto :eof
goto loop

endlocal
