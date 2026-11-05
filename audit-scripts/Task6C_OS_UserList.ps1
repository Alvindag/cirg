<#
.SYNOPSIS  Tracker row 6 - OPERATING SYSTEM user list (local accounts + local groups) for in-scope servers.
.DESCRIPTION
  Per server: local users (enabled, created via SID/profile, last logon, password last set, never-expires),
  local groups and members (Administrators, Remote Desktop Users etc.). Domain accounts in Administrators
  are shown as members. Screenshot console for evidence.
.EXAMPLE
  .\Task6C_OS_UserList.ps1 -Servers NAV-SERVER,DASVM001-DB,DASVM002-APO1,DASVM003-WEB,DAS-DC,DAS-DC2
#>
param(
  [Parameter(Mandatory)][string[]]$Servers,
  [string]$OutDir = "C:\Audit\Task6"
)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
Start-Transcript -Path "$OutDir\Task6C_Transcript_$stamp.txt" | Out-Null
$sb = {
  $users = Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True" | ForEach-Object {
    $n = $_.Name
    $nu = try { net user $n 2>$null } catch { $null }
    $last = ($nu | Select-String 'Last logon' ) -replace 'Last logon\s+',''
    $pls  = ($nu | Select-String 'Password last set') -replace 'Password last set\s+',''
    $grp = (Get-CimInstance Win32_GroupUser | Where-Object { $_.PartComponent.Name -eq $n -and $_.PartComponent.Domain -eq $env:COMPUTERNAME }).GroupComponent.Name -join '; '
    [pscustomobject]@{ Username=$n; FullName=$_.FullName; Status=$(if($_.Disabled){'Inactive'}else{'Active'}); Locked=$_.Lockout
      PasswordNeverExpires=(-not $_.PasswordExpires); LastLogon="$last".Trim(); PasswordLastSet="$pls".Trim(); Groups=$grp; SID=$_.SID }
  }
  $members = foreach ($g in Get-CimInstance Win32_Group -Filter "LocalAccount=True") {
    $m = Get-CimAssociatedInstance -InputObject $g -Association Win32_GroupUser
    if ($m) { foreach ($x in $m) { [pscustomobject]@{ Group=$g.Name; Member="$($x.Domain)\$($x.Name)"; Type=$x.CreationClassName } } }
    else { [pscustomobject]@{ Group=$g.Name; Member='(empty)'; Type='' } }
  }
  [pscustomobject]@{ Users=$users; Groups=$members }
}
$u = @(); $g = @()
foreach ($s in $Servers) {
  Write-Host "Collecting $s ..." -ForegroundColor Cyan
  try {
    $r = Invoke-Command -ComputerName $s -ScriptBlock $sb -ErrorAction Stop
    $u += $r.Users | Select-Object @{n='Server';e={$s}},*
    $g += $r.Groups | Select-Object @{n='Server';e={$s}},*
  } catch { Write-Warning "$s failed: $($_.Exception.Message)" }
}
$u | Export-Csv "$OutDir\Task6C_OS_LocalUsers_$stamp.csv" -NoTypeInformation
$g | Export-Csv "$OutDir\Task6C_OS_LocalGroups_$stamp.csv" -NoTypeInformation
Write-Host "`n===== SYSTEM COUNTS =====" -ForegroundColor Yellow
$u | Group-Object Server | ForEach-Object { "{0}: {1} local users ({2} active)" -f $_.Name,$_.Count,($_.Group|? Status -eq 'Active').Count }
$g | Where-Object Group -eq 'Administrators' | Group-Object Server | ForEach-Object { "{0}: {1} Administrators members" -f $_.Name,$_.Count }
Stop-Transcript | Out-Null
