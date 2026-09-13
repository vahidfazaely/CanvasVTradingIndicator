# Kill only headless (automation) Chrome processes, leave the user's real browser alone
$killed = 0
Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | ForEach-Object {
  if ($_.CommandLine -match '--headless' -or $_.CommandLine -match '--remote-debugging-pipe') {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $killed++
  }
}
Write-Output "killed $killed headless chrome processes"
Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object | ForEach-Object { Write-Output ("chrome processes remaining: " + $_.Count) }
