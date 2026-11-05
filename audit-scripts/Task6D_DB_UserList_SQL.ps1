<#
.SYNOPSIS  Tracker row 6 - DATABASE user list (SQL Server logins, server roles, database users and roles).
.DESCRIPTION
  For each SQL instance: server logins (type, disabled, created, modified, password policy), server-role
  membership (sysadmin etc.), and for every user database: users and database-role members.
  SQL Server does not record last logon natively; state 'Not tracked by SQL' or use login audit/ErrorLog.
.EXAMPLE
  .\Task6D_DB_UserList_SQL.ps1 -SqlServers DASVM001-DB
#>
param(
  [Parameter(Mandatory)][string[]]$SqlServers,
  [string]$OutDir = "C:\Audit\Task6"
)
if (-not (Get-Command Invoke-Sqlcmd -ErrorAction SilentlyContinue)) { Import-Module SqlServer -ErrorAction Stop }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
Start-Transcript -Path "$OutDir\Task6D_Transcript_$stamp.txt" | Out-Null
$loginSql = @"
SELECT @@SERVERNAME AS Server, sp.name AS LoginName, sp.type_desc AS LoginType,
  CASE sp.is_disabled WHEN 1 THEN 'Inactive' ELSE 'Active' END AS Status, sp.create_date AS CreateDate, sp.modify_date AS ModifyDate,
  sl.is_policy_checked AS PasswordPolicyEnforced, sl.is_expiration_checked AS PasswordExpiryEnforced,
  STUFF((SELECT '; ' + r.name FROM sys.server_role_members m JOIN sys.server_principals r ON r.principal_id=m.role_principal_id
         WHERE m.member_principal_id=sp.principal_id FOR XML PATH('')),1,2,'') AS ServerRoles
FROM sys.server_principals sp LEFT JOIN sys.sql_logins sl ON sl.principal_id=sp.principal_id
WHERE sp.type IN ('S','U','G','C','K') AND sp.name NOT LIKE '##%' ORDER BY sp.name
"@
$dbUserSql = @"
SELECT @@SERVERNAME AS Server, DB_NAME() AS DatabaseName, dp.name AS DbUser, dp.type_desc AS UserType, dp.create_date AS CreateDate,
  STUFF((SELECT '; ' + r.name FROM sys.database_role_members m JOIN sys.database_principals r ON r.principal_id=m.role_principal_id
         WHERE m.member_principal_id=dp.principal_id FOR XML PATH('')),1,2,'') AS DbRoles
FROM sys.database_principals dp WHERE dp.type IN ('S','U','G','E','X') AND dp.name NOT IN ('guest','INFORMATION_SCHEMA','sys') ORDER BY dp.name
"@
Write-Host "Queries used:`n$loginSql`n$dbUserSql" -ForegroundColor DarkGray
$logins = @(); $dbu = @()
foreach ($s in $SqlServers) {
  Write-Host "Collecting $s ..." -ForegroundColor Cyan
  try {
    $logins += Invoke-Sqlcmd -ServerInstance $s -TrustServerCertificate -Query $loginSql
    $dbs = (Invoke-Sqlcmd -ServerInstance $s -TrustServerCertificate -Query "SELECT name FROM sys.databases WHERE database_id>4 AND state=0").name
    foreach ($d in $dbs) { $dbu += Invoke-Sqlcmd -ServerInstance $s -Database $d -TrustServerCertificate -Query $dbUserSql }
  } catch { Write-Warning "$s failed: $($_.Exception.Message)" }
}
$logins | Export-Csv "$OutDir\Task6D_SQL_Logins_$stamp.csv" -NoTypeInformation
$dbu    | Export-Csv "$OutDir\Task6D_SQL_DatabaseUsers_$stamp.csv" -NoTypeInformation
Write-Host "`n===== SYSTEM COUNTS =====" -ForegroundColor Yellow
Write-Host "Server logins: $($logins.Count) | sysadmin members: $(($logins | ? { $_.ServerRoles -match 'sysadmin' }).Count)"
$dbu | Group-Object DatabaseName | ForEach-Object { "{0}: {1} database users" -f $_.Name,$_.Count }
Stop-Transcript | Out-Null
