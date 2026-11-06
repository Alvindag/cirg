<#
.SYNOPSIS  IT asset list from Active Directory (all computer accounts) - complements the network scan.
  Shows machines that were OFF during the scan, and stale accounts (no logon for 90+ days).
#>
param([string]$OutDir = 'C:\Audit\Assets')
Import-Module ActiveDirectory
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$cut = (Get-Date).AddDays(-90)
$c = Get-ADComputer -Filter * -Properties OperatingSystem,OperatingSystemVersion,IPv4Address,LastLogonDate,whenCreated,Enabled,Description |
  Select-Object Name,Enabled,OperatingSystem,OperatingSystemVersion,IPv4Address,LastLogonDate,whenCreated,Description,
    @{n='OU';e={$_.DistinguishedName -replace '^CN=.*?(?<!\\),',''}},
    @{n='Stale90Days';e={ (-not $_.LastLogonDate) -or ($_.LastLogonDate -lt $cut) }}
$c | Export-Csv "$OutDir\IT_Asset_AD_Computers_$stamp.csv" -NoTypeInformation -Encoding UTF8
"Total computer accounts : $($c.Count)"
"Enabled                 : $(($c | Where-Object Enabled).Count)"
"Servers                 : $(($c | Where-Object OperatingSystem -like '*Server*').Count)"
"Stale (no logon 90d+)   : $(($c | Where-Object Stale90Days).Count)"
$c | Group-Object OperatingSystem | Sort-Object Count -Descending | Format-Table Count,Name -AutoSize
