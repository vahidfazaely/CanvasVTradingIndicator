# Environment scan for temperature-monitoring setup (read-only)
"=== running monitoring tools ==="
Get-Process | Where-Object { $_.ProcessName -match 'HWiNFO|CoreTemp|OpenHardware|LibreHardware|HWMonitor|AIDA|Speccy|FanControl|SpeedFan|Ryzen' } | Select-Object ProcessName, Id | Format-Table -AutoSize

"=== installed dirs (Program Files) ==="
foreach ($d in @('C:\Program Files', 'C:\Program Files (x86)')) {
  Get-ChildItem $d -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'HWiNFO|CoreTemp|Hardware|AIDA|Speccy|FanControl' } |
    Select-Object -ExpandProperty FullName
}

"=== J:\ tools ==="
if (Test-Path 'J:\') {
  Get-ChildItem 'J:\' -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'HWiNFO|CoreTemp|Hardware|AIDA|Speccy|FanControl|Tools|Utils' } |
    Select-Object -ExpandProperty FullName
}

"=== drives ==="
Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n='FreeGB'; e={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize

"=== port 8085 in use? ==="
$l = netstat -ano | Select-String ':8085.*LISTEN'
if ($l) { $l } else { "free" }

"=== admin? ==="
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
"elevated shell: $isAdmin"
