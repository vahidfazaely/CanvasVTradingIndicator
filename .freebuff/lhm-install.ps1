# Download & extract LibreHardwareMonitor (latest release) to C:\Tools\LHM
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dest = 'C:\Tools\LHM'
$zip  = Join-Path $env:TEMP 'LibreHardwareMonitor.zip'

if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }

Write-Output "resolving latest release from GitHub API..."
$rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/LibreHardwareMonitor/LibreHardwareMonitor/releases/latest' -UseBasicParsing
Write-Output ("tag: " + $rel.tag_name)

$asset = $rel.assets | Where-Object { $_.name -match '\.zip$' } | Select-Object -First 1
if (-not $asset) { throw "no zip asset found in release" }
Write-Output ("asset: " + $asset.name + "  " + [math]::Round($asset.size/1MB,1) + "MB")

Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing
Write-Output ("downloaded {0:N1} MB" -f ((Get-Item $zip).Length / 1MB))

Expand-Archive -Path $zip -DestinationPath $dest -Force
Write-Output "extracted to $dest"
Get-ChildItem $dest | ForEach-Object { Write-Output ("  " + $_.Name) }

# Discover exact PersistentSettings key names for the web server (UTF-16 strings in .NET binaries)
Write-Output "--- webServer keys found in binaries ---"
$found = @{}
foreach ($f in @('LibreHardwareMonitor.exe', 'LibreHardwareMonitorLib.dll', 'LibreHardwareMonitor.UI.dll')) {
  $p = Join-Path $dest $f
  if (-not (Test-Path $p)) { continue }
  $text = [Text.Encoding]::Unicode.GetString([IO.File]::ReadAllBytes($p))
  foreach ($m in [regex]::Matches($text, 'webServer[A-Za-z]*')) { $found[$m.Value] = $true }
}
$found.Keys | Sort-Object | ForEach-Object { Write-Output "  $_" }
