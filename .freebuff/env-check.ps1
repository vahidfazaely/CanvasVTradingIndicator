# Check .NET runtimes/SDKs, pwsh, winget availability
$ErrorActionPreference = 'Continue'

Write-Output "=== dotnet runtimes ==="
if (Get-Command dotnet -ErrorAction SilentlyContinue) {
  dotnet --list-runtimes 2>&1 | ForEach-Object { Write-Output "  $_" }
  Write-Output "=== dotnet SDKs ==="
  dotnet --list-sdks 2>&1 | ForEach-Object { Write-Output "  $_" }
} else {
  Write-Output "  dotnet NOT installed"
}

Write-Output "=== pwsh 7 ==="
if (Get-Command pwsh -ErrorAction SilentlyContinue) { Write-Output "  pwsh installed" } else { Write-Output "  pwsh NOT installed" }

Write-Output "=== winget ==="
if (Get-Command winget -ErrorAction SilentlyContinue) {
  $v = (Get-Command winget).Version
  Write-Output ("  winget available, version: " + $v)
} else {
  Write-Output "  winget NOT installed"
}

Write-Output "=== OS ==="
$os = Get-CimInstance Win32_OperatingSystem
Write-Output ("  " + $os.Caption + " build " + $os.BuildNumber)
