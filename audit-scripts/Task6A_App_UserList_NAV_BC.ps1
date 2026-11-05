<#
.SYNOPSIS  Tracker row 6 - APPLICATION user list for Navision / Business Central (read from the app's SQL database).
.DESCRIPTION
  Exports users, their roles (permission sets) and last login, and prints counts. Read-only SELECTs.
  Table names differ by version; the script checks which exist and runs the matching query.
  Screenshot the console (the query text + counts) as evidence of how the report was generated.
.EXAMPLE
  .\Task6A_App_UserList_NAV_BC.ps1 -SqlServer DASVM001-DB -Database "NAVDB" -OutDir C:\Audit\Task6
  (Database name: SSMS > Databases, or on NAV-SERVER the NAV Administration console > Service Tier > Database)
#>
param(
  [Parameter(Mandatory)][string]$SqlServer,
  [Parameter(Mandatory)][string]$Database,
  [string]$OutDir = "C:\Audit\Task6"
)
if (-not (Get-Command Invoke-Sqlcmd -ErrorAction SilentlyContinue)) { Import-Module SqlServer -ErrorAction Stop }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
Start-Transcript -Path "$OutDir\Task6A_Transcript_$stamp.txt" | Out-Null
function Q($sql){ Invoke-Sqlcmd -ServerInstance $SqlServer -Database $Database -TrustServerCertificate -Query $sql -QueryTimeout 120 }
$tables = (Q "SELECT name FROM sys.tables").name

# Users (global tables, no company prefix)
$usersSql = @"
SELECT u.[User Name] AS Username, u.[Full Name] AS FullName,
       CASE u.[State] WHEN 0 THEN 'Active' ELSE 'Inactive' END AS Status,
       u.[License Type] AS LicenseType, u.[Windows Security ID] AS WindowsSID,
       u.[Authentication Email] AS AuthEmail
FROM [dbo].[User] u ORDER BY u.[User Name]
"@
$rolesSql = @"
SELECT u.[User Name] AS Username, ac.[Role ID] AS PermissionSet, ac.[Company Name] AS Company, ac.[Scope] AS Scope
FROM [dbo].[Access Control] ac JOIN [dbo].[User] u ON u.[User Security ID] = ac.[User Security ID]
ORDER BY u.[User Name]
"@
$loginSql = "SELECT u.[User Name] AS Username, MAX(l.[Last Login Date]) AS LastLogin FROM [dbo].[User Login] l JOIN [dbo].[User] u ON u.[User Security ID]=l.[User SID] GROUP BY u.[User Name]"

Write-Host "Query used (users):`n$usersSql" -ForegroundColor DarkGray
$users = Q $usersSql
$roles = Q $rolesSql
$logins = if ($tables -contains 'User Login') { Q $loginSql } else { Write-Warning "No 'User Login' table (older NAV). Last logon not stored - use Session Event/Change Log or state N/A."; @() }

$rows = foreach ($u in $users) {
  $r = $roles | Where-Object Username -eq $u.Username
  $l = $logins | Where-Object Username -eq $u.Username | Select-Object -First 1
  [pscustomobject]@{
    Username=$u.Username; FullName=$u.FullName; Status=$u.Status; LicenseType=$u.LicenseType
    Roles=(($r.PermissionSet | Sort-Object -Unique) -join '; ')
    IsSUPER=[bool]($r.PermissionSet -contains 'SUPER'); LastLogin=$l.LastLogin; Database=$Database; Server=$SqlServer
  }
}
$rows | Export-Csv "$OutDir\Task6A_App_Users_${Database}_$stamp.csv" -NoTypeInformation -Encoding UTF8
$roles | Export-Csv "$OutDir\Task6A_App_UserRoles_${Database}_$stamp.csv" -NoTypeInformation
Write-Host "`n===== SYSTEM COUNTS ($Database) =====" -ForegroundColor Yellow
Write-Host "Total users: $($rows.Count) | Active: $(($rows|? Status -eq 'Active').Count) | Inactive: $(($rows|? Status -eq 'Inactive').Count) | SUPER: $(($rows|? IsSUPER).Count)"
Stop-Transcript | Out-Null
