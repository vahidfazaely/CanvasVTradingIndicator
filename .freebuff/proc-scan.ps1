Write-Output "=== node.exe processes ==="
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  $c = if ($_.CommandLine) { $_.CommandLine.Substring(0, [Math]::Min(110, $_.CommandLine.Length)) } else { "(no cmdline)" }
  Write-Output ("  pid " + $_.ProcessId + "  " + $c)
}
Write-Output "=== chrome.exe sample (first 5) ==="
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Select-Object -First 5 | ForEach-Object {
  $c = if ($_.CommandLine) { $_.CommandLine.Substring(0, [Math]::Min(130, $_.CommandLine.Length)) } else { "(no cmdline)" }
  Write-Output ("  pid " + $_.ProcessId + "  " + $c)
}
Write-Output ("chrome total: " + (Get-Process chrome -ErrorAction SilentlyContinue).Count)
