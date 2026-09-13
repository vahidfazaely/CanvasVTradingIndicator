# Scan every binary in C:\Tools\LHM for web-server related setting key strings
$ErrorActionPreference = 'Stop'
$dest = 'C:\Tools\LHM'
$found = @{}
Get-ChildItem $dest -Include *.dll, *.exe -Recurse -Depth 0 | ForEach-Object {
  $text = [Text.Encoding]::Unicode.GetString([IO.File]::ReadAllBytes($_.FullName))
  foreach ($m in [regex]::Matches($text, '[wW]eb[sS]erver[A-Za-z]*')) { $found[$m.Value] = $_.Name }
}
if ($found.Count -eq 0) {
  Write-Output "no webServer* strings found; dumping all UTF-16 strings containing 'erver' for inspection:"
  Get-ChildItem $dest -Include *.dll, *.exe -Recurse -Depth 0 | ForEach-Object {
    $text = [Text.Encoding]::Unicode.GetString([IO.File]::ReadAllBytes($_.FullName))
    foreach ($m in [regex]::Matches($text, '[A-Za-z]*erver[A-Za-z]*')) { $found[$m.Value + " [" + $_.Name + "]"] = $true }
  }
}
$found.Keys | Sort-Object | ForEach-Object { Write-Output "  $_" }
