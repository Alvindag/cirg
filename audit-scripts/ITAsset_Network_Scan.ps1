<#
.SYNOPSIS  IT asset discovery for the DAS PLC network (ping sweep + WMI/CIM details). Works on Windows PowerShell 5.1.
.DESCRIPTION
  Pings every address in the given subnets (in parallel), then queries each live host for make, model, serial number,
  OS, domain, RAM, last boot, logged-on user. Devices that cannot be queried (printers, switches, firewalls, blocked PCs)
  are still listed with IP, DNS name and MAC address. Exports a CSV + transcript.
  Run as a domain admin from a machine that is allowed to reach WMI on the targets. NOTIFY your security team first:
  the sweep looks like reconnaissance to Wazuh/Kaspersky/IPS.
.EXAMPLE  .\ITAsset_Network_Scan.ps1 -Subnets '192.168.1.','192.168.20.'
#>
param(
  [string[]]$Subnets = @('192.168.1.','192.168.20.'),
  [int]$StartIP = 1, [int]$EndIP = 254,
  [string]$OutDir = 'C:\Audit\Assets'
)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
Start-Transcript -Path "$OutDir\ITAsset_Scan_Transcript_$stamp.txt" | Out-Null

$ips = foreach ($s in $Subnets) { $StartIP..$EndIP | ForEach-Object { "$s$_" } }
Write-Host "Pinging $($ips.Count) addresses ..." -ForegroundColor Cyan
$alive = New-Object System.Collections.Generic.List[string]
$batch = 64
for ($i = 0; $i -lt $ips.Count; $i += $batch) {
  $chunk = $ips[$i..([Math]::Min($i + $batch, $ips.Count) - 1)]
  $jobs  = $chunk | ForEach-Object { Test-Connection -ComputerName $_ -Count 1 -AsJob }
  $jobs | Wait-Job -Timeout 30 | Out-Null
  foreach ($j in $jobs) {
    $r = Receive-Job $j -ErrorAction SilentlyContinue
    if ($r -and $r.StatusCode -eq 0) { $alive.Add([string]$r.Address) }
  }
  $jobs | Remove-Job -Force
}
Write-Host "Live hosts: $($alive.Count)" -ForegroundColor Green

# MAC addresses from the ARP cache (filled by the pings above)
$mac = @{}
arp -a | ForEach-Object { if ($_ -match '^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f\-]{17})\s') { $mac[$Matches[1]] = $Matches[2].ToUpper() } }

function Get-Cim($ip) {
  foreach ($opt in @((New-CimSessionOption -Protocol Dcom), (New-CimSessionOption -Protocol Wsman))) {
    try { return New-CimSession -ComputerName $ip -SessionOption $opt -OperationTimeoutSec 20 -ErrorAction Stop } catch { $err = $_.Exception.Message }
  }
  throw $err
}

$assets = foreach ($ip in ($alive | Sort-Object { [version]$_ })) {
  Write-Host "Querying $ip ..." -ForegroundColor Yellow
  $dns = try { [System.Net.Dns]::GetHostEntry($ip).HostName } catch { '' }
  $row = [ordered]@{ IPAddress=$ip; Hostname=$dns; Manufacturer=''; Model=''; SerialNumber=''; LoggedOnUser=''; OperatingSystem=''
                     OSVersion=''; Domain=''; RAM_GB=''; LastBoot=''; MAC=$mac[$ip]; AssetType='Unknown'; Status='Online'; Note='' }
  try {
    $cs  = Get-Cim $ip
    $sys = Get-CimInstance -CimSession $cs -ClassName Win32_ComputerSystem
    $os  = Get-CimInstance -CimSession $cs -ClassName Win32_OperatingSystem
    $bio = Get-CimInstance -CimSession $cs -ClassName Win32_BIOS
    Remove-CimSession $cs
    $row.Hostname=$sys.Name; $row.Manufacturer=$sys.Manufacturer; $row.Model=$sys.Model; $row.SerialNumber=$bio.SerialNumber
    $row.LoggedOnUser=$sys.UserName; $row.OperatingSystem=$os.Caption; $row.OSVersion=$os.Version; $row.Domain=$sys.Domain
    $row.RAM_GB=[math]::Round($sys.TotalPhysicalMemory/1GB,1); $row.LastBoot=$os.LastBootUpTime
    $row.AssetType = if ($os.Caption -match 'Server') { 'Server' } else { 'Workstation' }
  } catch {
    $row.Note = 'Not queryable (non-Windows device, firewall, or WMI blocked): ' + $_.Exception.Message
  }
  [pscustomobject]$row
}
$assets | Export-Csv "$OutDir\IT_Asset_Network_List_$stamp.csv" -NoTypeInformation -Encoding UTF8
Write-Host "`n===== SUMMARY =====" -ForegroundColor Yellow
"Live hosts          : $($assets.Count)"
"Servers             : $(($assets | Where-Object AssetType -eq 'Server').Count)"
"Workstations       : $(($assets | Where-Object AssetType -eq 'Workstation').Count)"
"Not queryable/other : $(($assets | Where-Object AssetType -eq 'Unknown').Count)"
Write-Host "Saved: $OutDir\IT_Asset_Network_List_$stamp.csv"
Stop-Transcript | Out-Null
